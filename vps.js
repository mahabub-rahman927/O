const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const pty = require('node-pty');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
    // SSH Automatic Login Command
    // sshpass use kore password 'siyam11' automatic pathano hocche
    const shell = pty.spawn('sshpass', [
        '-p', 'siyam11', 
        'ssh', '-o', 'StrictHostKeyChecking=no', 
        'siyam@157.173.120.35'
    ], {
        name: 'xterm-color',
        cols: 100,
        rows: 30,
        cwd: process.env.HOME,
        env: process.env
    });

    shell.on('data', (data) => {
        socket.emit('output', data);
    });

    socket.on('input', (data) => {
        shell.write(data);
    });

    socket.on('disconnect', () => {
        shell.kill();
    });
});

server.listen(9837, '0.0.0.0', () => {
    console.log('Shell is running on http://157.173.120.35:3000');
});
