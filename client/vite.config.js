import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            // En desarrollo local, el frontend le pega a /api y Vite lo redirige
            // al backend — así no hay que tocar URLs entre local y producción.
            '/api': 'http://localhost:3000'
        }
    }
});
