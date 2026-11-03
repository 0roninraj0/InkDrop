import { render } from 'preact';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import './styles.css';
import { App } from './App.jsx';

render(<App />, document.getElementById('app'));
