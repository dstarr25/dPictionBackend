import { ServerWebSocket } from "bun"
import { CanvasData, CloseReasons, GameStates, JoinData, JoinResponse, ToServerMessages, Player, Room, SocketMessage, ToClientMessages, SocketPlayerData, StartDataToServer, PromptDataToServer, Prompt, ChoosePromptDataToServer, DrawDataToServer, GuessDataToServer, HintDataToServer, SelectWinnerDataToServer } from './types'
import { randomUUID } from "crypto"
import timer from "./timer"
import messageFunctionsGenerator from "./messageFunctions"

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

    useRoutes(path: string, routes: Router) {
        for (const [routePath, foo] of Object.entries(routes.routes)) {
            this.routes[(path + routePath).replace(/\/+/g, '/')] = foo
        }
    }

    listen(port: number) {
        const routes = this.routes
        const rooms: { [key: string]: Room } = {}
        const messageFunctions = messageFunctionsGenerator(rooms)
        const playerJoin = (gameId: string, name: string, ws: ServerWebSocket<SocketPlayerData>) => {
            ws.data = { gameId, playerName: name }
            const player = new Player(name, ws)
            rooms[gameId].players[name] = player

            Object.entries(rooms[gameId].players).forEach(([playerName, player]) => {
                if (playerName === name) return;
                // send join message to all the other players in that game so they know someone joined
                const joinMessage = new SocketMessage(ToClientMessages.JOIN, { name })
                // console.log(JSON.stringify(joinMessage))
                player.ws.send(JSON.stringify(joinMessage))
            });

            // make join response socket message then send it
            const joinResponse = new SocketMessage(ToClientMessages.JOIN_SUCCESS, {
                players: Object.keys(rooms[gameId].players),
                admin: rooms[gameId].admin,
                gameId
            })
            ws.send(JSON.stringify(joinResponse))

        }

        const printRooms = () => {
            const tempRooms = JSON.parse(JSON.stringify(rooms))
            Object.keys(tempRooms).forEach((roomId) => {
                Object.keys(tempRooms[roomId].players).forEach((playerName) => {
                    delete tempRooms[roomId].players[playerName].ws
                })
            })
            console.log('========== ROOMS ==========')
            console.log(tempRooms)
            console.log('===========================')

        }

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

                if (lookup === '/ GET') return new Response(JSON.stringify(rooms))
                if (routes[lookup] === undefined) return new Response('404!')
                
                return routes[lookup]()
                
            },
            websocket: {
                async message(ws: ServerWebSocket<SocketPlayerData>, message) { // when receives a message from a client
                    const messageData = JSON.parse(message.toString()) as SocketMessage
                    messageFunctions[messageData.action](ws, messageData)
                },
                open(ws) {
                    console.log(`client connected with remoteAddress: ${ws.remoteAddress}`)
                },
                close(ws) {
                    console.log('client closing:', ws.data)
                    if (ws.data === undefined) return
                    const { gameId, playerName } = ws.data

                    // if ws data, room, or player is undefined, don't do anything

                    if (gameId === undefined || playerName === undefined || rooms[gameId] === undefined || rooms[gameId].players[playerName] === undefined) return

                    // delete the player from the room
                    delete rooms[gameId].players[playerName]

                    // delete room if no one remains
                    if (Object.keys(rooms[gameId].players).length === 0) {
                        delete rooms[gameId]
                        return
                    }

                    // send leave response to all players that remain, so they know who left.
                    // this includes the name of the player that left, as well as the new drawer and admin
                    let { drawer, admin } = rooms[gameId]

                    // change admin if admin was kicked out
                    if (playerName === admin) {
                        admin = Object.keys(rooms[gameId].players)[0]
                    }

                    // TODO2: change person drawing if drawer is kicked out
                    if (rooms[gameId].drawer === playerName) {
                        // drawer = ?
                    }

                    const leaveMessage = new SocketMessage(ToClientMessages.LEAVE, { playerName, drawer, admin })
                    rooms[gameId].drawer = drawer
                    rooms[gameId].admin = admin
                    Object.keys(rooms[gameId].players).forEach((name) => {
                        rooms[gameId].players[name].ws.send(JSON.stringify(leaveMessage))
                    })
                }
            },
        })
    }
}

const router = () => new Router()
const server = () => new Server()

const ApiServer = { router, server }

export default ApiServer