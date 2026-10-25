import 'leaflet/dist/leaflet.css';
import '../markers.css';
import './landing.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Landing } from './Landing.tsx';

createRoot(document.getElementById('root')!).render(<StrictMode><Landing /></StrictMode>);
