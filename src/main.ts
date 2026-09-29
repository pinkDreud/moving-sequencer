import { mount } from 'svelte';
import App from './ui/App.svelte';
import { AppState, defaultSong, randomIdGen } from './state.svelte';
import './ui/global.css';

const target = document.getElementById('app');
if (!target) throw new Error('#app element missing');

const nextId = randomIdGen();
const app = new AppState({ song: defaultSong(nextId), nextId });

export default mount(App, { target, props: { app } });
