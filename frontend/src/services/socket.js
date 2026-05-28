import { io } from 'socket.io-client';

// Points to your unified backend gateway server
const SOCKET_URL = 'http://localhost:4000';

export const socket = io(SOCKET_URL, {
    autoConnect: false, // Prevents burning connections before the user triggers a workflow
    transports: ['websocket']
});