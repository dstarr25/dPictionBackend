import { ServerWebSocket } from "bun"

const cWidth = 200;
const cHeight = 150;

export class CanvasData {
    width: number
    height: number
    pixels: number[]

    constructor() {
        this.width = cWidth
        this.height = cHeight
        this.pixels = Array.from({ length: cWidth * cHeight * 4 }, () => 255)
    }
}

export enum ToServerMessages {
    JOIN = 'join', // someone tryna join
    DRAW = 'draw', // drawer draws something
    GUESS = 'guess', // someone makes a guess
    PROMPT = 'prompt', // someone writes a prompt
}

export enum ToClientMessages {
    JOIN_SUCCESS = 'join_success', // successful join, server sends room data
    JOIN = 'join', // to tell the clients that someone else joined
    DRAW = 'draw', // drawer draws something
    GUESS = 'guess', // someone makes a guess, only send to drawer
}

export enum CloseReasons {
    GAME_NO_EXIST = 4000,
    GAME_IN_PROGRESS = 4001,
    NAME_TAKEN = 4002,
}

export enum GameStates {
    OPEN = 'open',
    PROMPTS = 'prompts',
    DRAWING = 'drawing'
}

export interface Guess {
    playerId: number,
    guess: string,
}

export class Player {
    name: string
    score: number
    guess: string
    ws: ServerWebSocket<unknown>

    constructor(name: string, ws: ServerWebSocket<unknown>) {
        this.name = name
        this.score = 0
        this.guess = ""
        this.ws = ws
    }
}

export interface Prompt {
    prompt: string,
    author: string
}

export class SocketMessage {
    action: string
    data: Object
    constructor(action: string, data: Object) {
        this.action = action
        this.data = data
    }
}

export interface JoinData {
    name: string,
    gameId: string
}

export class Room {
    players: {[key: string]: Player}
    // canvasData: CanvasData
    roundNum: number
    gameState: string
    prompt: string
    drawer: string
    admin: string

    constructor() {
        this.players = {}
        // this.canvasData = new CanvasData()
        this.roundNum = -1
        this.gameState = GameStates.OPEN
        this.prompt = ""
        this.drawer = ""
        this.admin = ""

    }


}

export interface JoinResponse {
    roomId: string,
    name: string
}