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

export interface Guess {
    playerId: number,
    guess: string,
}

export interface Player {
    name: string,
    id: number,
    score: number,
    isDrawer: boolean,
    currentGuess: string,
    isAdmin: boolean,
    ws: ServerWebSocket<unknown>,
}

export interface Prompt {
    prompt: string,
    playerId: number
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
    playerIds: number[],
    canvasData: CanvasData
}

export interface JoinResponse {
    roomId: string,
    playerId: number,
}