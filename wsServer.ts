import { ServerWebSocket } from "bun"
import { CanvasData, CloseReasons, GameStates, JoinData, JoinResponse, ToServerMessages, Player, Room, SocketMessage, ToClientMessages, SocketPlayerData, StartDataToServer, PromptDataToServer } from './types'
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
            const tempRooms = JSON.parse(JSON.stringify(rooms)) as any
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

                if (routes[lookup] === undefined) return new Response('404!')

                
                return routes[lookup]()
                
            },
            websocket: {
                async message(ws: ServerWebSocket<SocketPlayerData>, message) { // when receives a message from a client
                    // console.log(data)
                    const messageData = JSON.parse(message.toString()) as SocketMessage
                    switch (messageData.action) {
                        case ToServerMessages.JOIN: {


                            const data = messageData.data as JoinData
                            console.log('join data', data)
                            if (data.gameId === 'banana') { // they are creating a game. they're the first player to join, so they 
                                const newRoomId = randomUUID()
                                rooms[newRoomId] = new Room()
                                
                                rooms[newRoomId].admin = data.name

                                playerJoin(newRoomId, data.name, ws)
                                printRooms()

                                break
                            }
                            // they are trying to join a game, but it might not exist
                            if (!Object.keys(rooms).includes(data.gameId)) {
                                console.log(`couldn't join because no room with the id ${data.gameId} exists.`)
                                ws.close(CloseReasons.GAME_NO_EXIST)
                                printRooms()
                                break
                            }

                            // they are joining a game that already exists, but might not be joinable...
                            if (rooms[data.gameId].gameState !== GameStates.OPEN) {
                                console.log(`couldn't join because the game was not open.`)
                                ws.close(CloseReasons.GAME_IN_PROGRESS)
                                printRooms()
                                break
                            }
                            
                            // they are joining a room that can be joined, but their name might be taken...
                            if (Object.keys(rooms[data.gameId].players).includes(data.name)) {
                                console.log(`couldn't join because the name ${data.name} was already taken.`)
                                ws.close(CloseReasons.NAME_TAKEN)
                                printRooms()
                                break
                            }

                            // make them join the game they're tryna join
                            playerJoin(data.gameId, data.name, ws)

                            // what do be rooms
                            printRooms()
                            break

                        }
                        case ToServerMessages.START: {
                            const data = messageData.data as StartDataToServer
                            if (rooms[data.gameId] === undefined || rooms[data.gameId].admin !== data.name) break

                            if (Object.keys(rooms[data.gameId].players).length < 3) {
                                const errorMessage = new SocketMessage(ToClientMessages.ERROR, { error: 'Need 3 or more players.' })
                                ws.send(JSON.stringify(errorMessage))
                                break
                            }

                            rooms[data.gameId].gameState = GameStates.PROMPTS
                            const startMessage = new SocketMessage(ToClientMessages.START, {})
                            Object.values(rooms[data.gameId].players).forEach((player) => {
                                player.ws.send(JSON.stringify(startMessage))
                            })
                            const timer = setTimeout(() => {
                                // const { prompts } = rooms[data.gameId]
                                // const shuffled = prompts.sort(() => 0.5 - Math.random());
                                // const startDrawingMessage = new SocketMessage(ToClientMessages.START_DRAWING, {
                                //     drawer: Object.keys(rooms[data.gameId].players)[0],
                                //     promptOptions: shuffled.slice(0, 3)
                                // })
                                //
                                
                                // TODO: send drawingphase start message to everyone
                                // TODO: pick drawer and send drawer assignment message to them, with their choices
                                // TODO: send non drawer assignment message to everyone else

                                // grabs a prompt from each player that's not `excluded`
                                const excluded = 'drawer'
                                const choices = []
                                Object.keys(rooms[data.gameId].players).forEach((playerName) => {
                                    if (playerName === excluded) return
                                    if (rooms[data.gameId].players[playerName].prompts.length === 0) return
                                    rooms[data.gameId].players[playerName].prompts.sort(() => 0.5 - Math.random())
                                    const choice = rooms[data.gameId].players[playerName].prompts.pop()
                                    choices.push(choice)
                                })
                                
                                // Object.values(rooms[data.gameId].players).forEach((player) => {
                                //     player.ws.send(JSON.stringify(startDrawingMessage))
                                // })
                            }, 10000) // <--- duration of prompts stage
                            break
                        }
                        case ToServerMessages.PROMPT: {
                            const { name, gameId, prompt } = messageData.data as PromptDataToServer
                            if (rooms[gameId] === undefined || rooms[gameId].players[name] === undefined || rooms[gameId].gameState !== GameStates.PROMPTS) break
                            
                            rooms[gameId].players[name].prompts.push({ author: name, prompt })
                            const promptSuccessMessage = new SocketMessage(ToClientMessages.PROMPT_SUCCESS, { prompt })
                            ws.send(JSON.stringify(promptSuccessMessage)) // send prompt success message
                            printRooms()
                        }
                        default:
                            break
                    }
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
                    printRooms()
                }
                
            },

        })
    }
}

const router = () => new Router()
const server = () => new Server()

const ApiServer = { router, server }

export default ApiServer