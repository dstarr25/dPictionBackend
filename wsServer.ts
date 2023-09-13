import { ServerWebSocket } from "bun"
import { CanvasData, CloseReasons, GameStates, JoinData, JoinResponse, ToServerMessages, Player, Room, SocketMessage } from './types'
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
                        case ToServerMessages.JOIN: {

                            const playerJoin = (gameId: string, name: string) => {
                                const player = new Player(name, ws)
                                rooms[gameId].players[name] = player

                                Object.entries(rooms[gameId].players).forEach(([playerName, player]) => {
                                    if (playerName === name) return;
                                    // send join message to all the other players in that game so they know someone joined
                                    const joinMessage = new SocketMessage(ToServerMessages.JOIN, { roomId: gameId, name } as JoinResponse)
                                    player.ws.send(JSON.stringify(joinMessage))
                                });

                                // make join response socket message then send it
                                const joinResponse = new SocketMessage(ToServerMessages.JOIN, { roomId: gameId } as JoinResponse)
                                ws.send(JSON.stringify(joinResponse))

                            }

                            const data = messageData.data as JoinData
                            console.log('join data', data)
                            if (data.gameId === 'banana') { // they are creating a game. they're the first player to join, so they 
                                const newRoomId = randomUUID()
                                rooms[newRoomId] = new Room()
                                
                                playerJoin(newRoomId, data.name)

                                break;
                            }
                            // they are trying to join a game, but it might not exist
                            if (!Object.keys(rooms).includes(data.gameId)) {
                                ws.close(CloseReasons.GAME_NO_EXIST)
                                break;
                            }

                            // they are joining a game that already exists, but might not be joinable...
                            if (rooms[data.gameId].gameState !== GameStates.OPEN) {
                                ws.close(CloseReasons.GAME_IN_PROGRESS)
                                break;
                            }
                            
                            // they are joining a room that can be joined, but their name might be taken...
                            if (Object.keys(rooms[data.gameId].players).includes(data.name)) {
                                ws.close(CloseReasons.NAME_TAKEN)
                                break;
                            }

                            // make them join the game they're tryna join
                            playerJoin(data.gameId, data.name)

                            // what do be rooms
                            console.log('rooms do be:', rooms)
                            break;


                        }
                        default:
                            break;
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