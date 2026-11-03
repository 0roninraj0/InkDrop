package com.inkdrop.reader;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.DocumentsContract;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.FileInputStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Offline folder access through the Storage Access Framework.
 * The user picks a folder once; read access is persisted. Files are never copied.
 */
@CapacitorPlugin(name = "ComicFs")
public class ComicFsPlugin extends Plugin {

    private static final String[] EXTS = {".cbz", ".zip", ".cbr", ".rar", ".pdf"};

    private static class Handle {
        ParcelFileDescriptor pfd;
        FileChannel channel;
    }

    private final Map<String, Handle> handles = new HashMap<>();

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, i, "pickFolderResult");
    }

    @ActivityCallback
    private void pickFolderResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("cancelled");
            return;
        }
        Uri tree = result.getData().getData();
        try {
            getContext().getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Exception ignored) { }
        String name = "Comics";
        try {
            String docId = DocumentsContract.getTreeDocumentId(tree);
            Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, docId);
            try (Cursor c = getContext().getContentResolver().query(doc,
                    new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME}, null, null, null)) {
                if (c != null && c.moveToFirst() && c.getString(0) != null) name = c.getString(0);
            }
        } catch (Exception ignored) { }
        JSObject ret = new JSObject();
        ret.put("uri", tree.toString());
        ret.put("name", name);
        call.resolve(ret);
    }

    @PluginMethod
    public void listFiles(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) { call.reject("uri required"); return; }
        try {
            Uri tree = Uri.parse(uriStr);
            JSArray out = new JSArray();
            walk(tree, DocumentsContract.getTreeDocumentId(tree), "", out, 0);
            JSObject ret = new JSObject();
            ret.put("files", out);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Cannot read folder: " + e.getMessage());
        }
    }

    private void walk(Uri tree, String parentId, String rel, JSArray out, int depth) {
        if (depth > 12) return;
        ContentResolver cr = getContext().getContentResolver();
        Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, parentId);
        String[] cols = {
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE,
                DocumentsContract.Document.COLUMN_SIZE,
                DocumentsContract.Document.COLUMN_LAST_MODIFIED
        };
        try (Cursor c = cr.query(children, cols, null, null, null)) {
            if (c == null) return;
            while (c.moveToNext()) {
                String id = c.getString(0);
                String name = c.getString(1);
                String mime = c.getString(2);
                if (name == null || name.startsWith(".")) continue;
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                    walk(tree, id, rel + name + "/", out, depth + 1);
                    continue;
                }
                String lower = name.toLowerCase(Locale.ROOT);
                boolean match = false;
                for (String e : EXTS) if (lower.endsWith(e)) { match = true; break; }
                if (!match) continue;
                JSObject f = new JSObject();
                f.put("uri", DocumentsContract.buildDocumentUriUsingTree(tree, id).toString());
                f.put("name", name);
                f.put("path", rel + name);
                f.put("size", c.isNull(3) ? 0 : c.getLong(3));
                f.put("mtime", c.isNull(4) ? 0 : c.getLong(4));
                out.put(f);
            }
        }
    }

    private synchronized Handle handle(String uriStr) throws Exception {
        Handle h = handles.get(uriStr);
        if (h != null) return h;
        h = new Handle();
        h.pfd = getContext().getContentResolver().openFileDescriptor(Uri.parse(uriStr), "r");
        if (h.pfd == null) throw new Exception("cannot open file");
        h.channel = new FileInputStream(h.pfd.getFileDescriptor()).getChannel();
        if (handles.size() > 8) closeAll();
        handles.put(uriStr, h);
        return h;
    }

    private synchronized void closeAll() {
        for (Handle h : handles.values()) closeHandle(h);
        handles.clear();
    }

    private void closeHandle(Handle h) {
        try { h.channel.close(); } catch (Exception ignored) { }
        try { h.pfd.close(); } catch (Exception ignored) { }
    }

    /** read({uri, offset, length}) -> {data: base64} */
    @PluginMethod
    public void read(PluginCall call) {
        String uri = call.getString("uri");
        long offset = call.getData().optLong("offset", 0);
        int length = call.getData().optInt("length", 0);
        if (uri == null || length <= 0) { call.reject("bad arguments"); return; }
        try {
            Handle h = handle(uri);
            ByteBuffer buf = ByteBuffer.allocate(length);
            int total = 0;
            synchronized (h) {
                while (total < length) {
                    int n = h.channel.read(buf, offset + total);
                    if (n <= 0) break;
                    total += n;
                }
            }
            JSObject ret = new JSObject();
            ret.put("data", Base64.encodeToString(buf.array(), 0, total, Base64.NO_WRAP));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("read failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void close(PluginCall call) {
        String uri = call.getString("uri");
        synchronized (this) {
            Handle h = uri == null ? null : handles.remove(uri);
            if (h != null) closeHandle(h);
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        closeAll();
    }
}
