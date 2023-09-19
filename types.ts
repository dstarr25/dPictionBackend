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
    START = 'start',
}

export enum ToClientMessages {
    JOIN_SUCCESS = 'joinsuccess', // successful join, server sends room data
    JOIN = 'join', // to tell the clients that someone else joined
    LEAVE = 'leave',
    DRAW = 'draw', // drawer draws something
    GUESS = 'guess', // someone makes a guess, only send to drawer
    START = 'start',
    ERROR = 'error',
    PROMPT_SUCCESS = 'promptsuccess',
    START_DRAWING = 'startdrawing',
}

export enum CloseReasons {
    GAME_NO_EXIST = 4000,
    GAME_IN_PROGRESS = 4001,
    NAME_TAKEN = 4002,
}

export const CodeMessages = {
    [CloseReasons.GAME_NO_EXIST]: 'The game you are trying to join does not exist.',
    [CloseReasons.GAME_IN_PROGRESS]: 'The game you are trying to join is in progress.',
    [CloseReasons.NAME_TAKEN]: 'The name you have chosen was already taken.',
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
    ws: ServerWebSocket<SocketPlayerData>
    prompts: Prompt[]

    constructor(name: string, ws: ServerWebSocket<SocketPlayerData>) {
        this.name = name
        this.score = 0
        this.guess = ""
        this.ws = ws
        this.prompts = []
    }
}

export interface Prompt {
    prompt: string,
    author: string
}

export interface SocketPlayerData {
    gameId: string,
    playerName: string
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
    prompts: Prompt[]

    constructor() {
        this.players = {}
        // this.canvasData = new CanvasData()
        this.roundNum = -1
        this.gameState = GameStates.OPEN
        this.prompt = ""
        this.drawer = ""
        this.admin = ""
        this.prompts = []
    }


}

export interface JoinResponse {
    roomId: string,
    name: string
}

export interface StartDataToServer {
    name: string,
    gameId: string,
}

export interface PromptDataToServer {
    name: string,
    gameId: string,
    prompt: string,
}
