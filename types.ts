import { ServerWebSocket } from "bun"

export interface CanvasData {
    width: number,
    height: number,
    pixels: number[]
}

export enum MessageTypes {
    JOIN = 'join', // someone joins
    DRAW = 'draw', // drawer draws something
    GUESS = 'guess', // someone makes a guess
    PROMPT = 'prompt', // someone writes a prompt
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

export interface Player {
    name: string,
    score: number,
    guess: string,
    ws: ServerWebSocket<unknown>,
}

export interface Prompt {
    prompt: string,
    author: string
}

export interface SocketMessage {
    action: string,
    data: Object
}

export interface JoinData {
    name: string,
    gameId: string
}

export interface Room {
    players: {[key: string]: Player},
    canvasData: CanvasData,
    roundNum: number,
    gameState: string,
    prompt: string,
    drawer: string,
    admin: string,


}

export interface JoinResponse {
    roomId: string,
}