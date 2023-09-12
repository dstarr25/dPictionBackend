const socket = new WebSocket("ws://localhost:3000")
socket.addEventListener("message", event => { 
    console.log(`Received message: ${event.data}`)
})
socket.addEventListener("open", () => {
    console.log("WebSocket connection opened.");
    // Now that the connection is open, you can send a message.
    socket.send("urmother");
});

