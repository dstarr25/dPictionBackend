import { ServerWebSocket } from "bun"
import { CanvasData, GameStates, JoinData, JoinResponse, MessageTypes, Player, Room, SocketMessage } from './types'
import { randomUUID } from "crypto"

class Router {
    public routes: { [key: string]: Function }
    // get, post, put, delete: Function
    get: Function
    post: Function
    put: Function
    delete: Function

    constructor() {
        this.routes = {}
        this.get = (path: string, foo: Function) => this.request('GET', path, foo)
        this.post = (path: string, foo: Function) => this.request('POST', path, foo)
        this.put = (path: string, foo: Function) => this.request('PUT', path, foo)
        this.delete = (path: string, foo: Function) => this.request('DELETE', path, foo)
    }
    
    // closure to create all the request types. idk why I'm doing this lmao
    request(reqType: string, path: string, foo: Function) {
        // console.log(path + ' ' + reqType)
        this.routes[path + ' ' + reqType] = foo
    }
}

class Server extends Router {
    // public routes: { [key: string]: Function }

    constructor() {
        super()
    }

    useRoutes(path: string, routes: Router) {
        for (const [routePath, foo] of Object.entries(routes.routes)) {
            this.routes[(path + routePath).replace(/\/+/g, '/')] = foo
        }
    }

    listen(port: number) {
        const routes = this.routes
        const rooms: { [key: string]: Room } = {}
        let clients: ServerWebSocket<unknown>[] = []
        console.log(`server listens - port ${port}. here are your routes :)\n`, routes)
        Bun.serve({
            port,
            fetch(req: Request) {

                const success = this.upgrade(req);
                
                // Bun automatically returns a 101 Switching Protocols if the upgrade succeeds
                if (success) return undefined;
                    

                const url = new URL(req.url)
                const method = req.method
                const lookup = url.pathname + ' ' + method

                if (routes[lookup] === undefined) return new Response('404!')

                
                return routes[lookup]()
                
            },
            websocket: {
                async message(ws, message) { // when receives a message from a client
                    // console.log(data)
                    const messageData = JSON.parse(message.toString()) as SocketMessage
                    switch (messageData.action) {
                        case MessageTypes.JOIN: {
                            console.log('join message')
                            const data = messageData.data as JoinData
                            console.log('join data', data)
                            if (data.gameId === 'banana') { // they are creating a game. they're the first player to join, so they 
                                const newRoomId = randomUUID()
                                const player = {
                                    name: data.name,
                                    score: 0,
                                    guess: "",
                                    ws
                                } as Player
                                rooms[newRoomId] = {
                                    players: {[data.name]: player},
                                    canvasData: {
                                        width: 200,
                                        height: 150,
                                        pixels: []
                                    },
                                    gameState: GameStates.OPEN,
                                    roundNum: -1,
                                    prompt: "",
                                    admin: data.name,
                                    drawer: "",

                                } as Room
                                
                                const joinResponse = {
                                    action: MessageTypes.JOIN,
                                    data: {
                                        roomId: newRoomId,
                                    } as JoinResponse
                                } as SocketMessage
                                
                                console.log(rooms)
                                ws.send(JSON.stringify(joinResponse))
                                break;
                            }
                            // they are trying to join a game that (they think) exists.
                            if (!Object.keys(rooms).includes(data.gameId)) {
                                const joinResponse = {
                                    action: MessageTypes.JOIN,
                                    data: {
                                        roomId: "",
                                    } as JoinResponse
                                } as SocketMessage
                                ws.send(JSON.stringify(joinResponse))
                                ws.close(4000, 'room with that id does not exist.')
                            }

                            // they are joining a game that already exists.

                            // make them a player
                            const player = {
                                name: data.name,
                                score: 0,
                                guess: "",
                                ws
                            } as Player

                            // put their player info in
                            rooms[data.gameId].players[data.name] = player

                            // make a join response and send it
                            const joinResponse = {
                                action: MessageTypes.JOIN,
                                data: {
                                    roomId: data.gameId,
                                } as JoinResponse
                            } as SocketMessage
                            ws.send(JSON.stringify(joinResponse))

                            // what do be rooms
                            console.log(rooms)
                            break;


                        }

                    }
                    // clients.forEach((client) => {
                    //     if (client !== ws && client.readyState === WebSocket.OPEN) {
                    //         console.log("sending data to a socket")
                    //         client.send(message)
                    //     } else {
                    //         console.log("this socket was the sender, not sending data to it :)")
                    //     }
                    // })
                },
                open(ws) {
                    console.log(`client connected with remoteAddress: ${ws.remoteAddress}`)
                    clients.push(ws)
                },
                close(ws) {
                    const i = clients.indexOf(ws)
                    if (i < 0 || i > clients.length) return
                    clients.splice(i, 1)
                    console.log('closed a client')
                }
                
            },

        })
    }
}

const router = () => new Router()
const server = () => new Server()

const ApiServer = { router, server }

export default ApiServer