package com.inkdrop.reader;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ComicFsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
