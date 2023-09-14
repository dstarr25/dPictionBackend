import { JoinData, ToServerMessages, SocketMessage } from "./types"

const socket = new WebSocket("ws://localhost:3000")
socket.addEventListener("message", event => { 
    console.log(`Received message: ${event.data}`)
})
socket.addEventListener("open", () => {
    console.log("WebSocket connection opened.");
    // Now that the connection is open, you can send a message.
    const joinMessage = new SocketMessage(ToServerMessages.JOIN, {
        name: 'second',
        gameId: '2d9bf5d5-801d-4fd5-a57f-100a257fd89d'
    })
    socket.send(JSON.stringify(joinMessage));
})

socket.addEventListener("close", event => {
  console.log(`socket closed with code ${event.code}.`)
})