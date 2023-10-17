import { ServerWebSocket } from "bun"
import { CanvasData, CloseReasons, GameStates, JoinData, JoinResponse, ToServerMessages, Player, Room, SocketMessage, ToClientMessages, SocketPlayerData, StartDataToServer, PromptDataToServer, Prompt, ChoosePromptDataToServer, DrawDataToServer, GuessDataToServer, HintDataToServer, SelectWinnerDataToServer } from './types'
import { randomUUID } from "crypto"
import timer from "./timer"

const playerJoin = (room: Room, gameId: string, name: string, ws: ServerWebSocket<SocketPlayerData>) => {
    ws.data = { gameId, playerName: name }
    const player = new Player(name, ws)
    room.players[name] = player

    Object.entries(room.players).forEach(([playerName, player]) => {
        if (playerName === name) return;
        // send join message to all the other players in that game so they know someone joined
        const joinMessage = new SocketMessage(ToClientMessages.JOIN, { name })
        // console.log(JSON.stringify(joinMessage))
        player.ws.send(JSON.stringify(joinMessage))
    });

    // make join response socket message then send it
    const joinResponse = new SocketMessage(ToClientMessages.JOIN_SUCCESS, {
        players: Object.keys(room.players),
        admin: room.admin,
        gameId
    })
    ws.send(JSON.stringify(joinResponse))
}


const messageFunctionsGenerator = (rooms: { [key: string]: Room }) => ({
    [ToServerMessages.JOIN]: (ws: ServerWebSocket<SocketPlayerData>, messageData: any) => {
        const data = messageData.data as JoinData
        console.log('join data', data)
        if (data.gameId === 'banana') { // they are creating a game. they're the first player to join, so they 
            const newRoomId = randomUUID()
            rooms[newRoomId] = new Room()
            
            rooms[newRoomId].admin = data.name

            playerJoin(rooms[newRoomId], newRoomId, data.name, ws)

            return
        }
        // they are trying to join a game, but it might not exist
        if (!Object.keys(rooms).includes(data.gameId)) {
            console.log(`couldn't join because no room with the id ${data.gameId} exists.`)
            ws.close(CloseReasons.GAME_NO_EXIST)
            return
        }

        // they are joining a game that already exists, but might not be joinable...
        if (rooms[data.gameId].gameState !== GameStates.OPEN) {
            console.log(`couldn't join because the game was not open.`)
            ws.close(CloseReasons.GAME_IN_PROGRESS)
            return
        }
        
        // they are joining a room that can be joined, but their name might be taken...
        if (Object.keys(rooms[data.gameId].players).includes(data.name)) {
            console.log(`couldn't join because the name ${data.name} was already taken.`)
            ws.close(CloseReasons.NAME_TAKEN)
            return
        }

        // make them join the game they're tryna join
        playerJoin(rooms[data.gameId], data.gameId, data.name, ws)
    },
    [ToServerMessages.START]: (ws: ServerWebSocket<SocketPlayerData>, messageData: any) => {
        const data = messageData.data as StartDataToServer
        if (rooms[data.gameId] === undefined || rooms[data.gameId].admin !== data.name) return

        if (Object.keys(rooms[data.gameId].players).length < 3) {
            const errorMessage = new SocketMessage(ToClientMessages.ERROR, { error: 'Need 3 or more players.' })
            ws.send(JSON.stringify(errorMessage))
            return
        }

        rooms[data.gameId].gameState = GameStates.PROMPTS
        const startMessage = new SocketMessage(ToClientMessages.START, {})
        Object.values(rooms[data.gameId].players).forEach((player) => {
            player.ws.send(JSON.stringify(startMessage))
        })
        timer((remaining) => {
            // send time remaining message to sockets
            Object.values(rooms[data.gameId].players).forEach((player) => {
                const timeRemainingMessage = new SocketMessage(ToClientMessages.TIME_REMAINING, {timeRemaining: remaining})
                player.ws.send(JSON.stringify(timeRemainingMessage))
            })
        }, () => {
            
            // TODO: send drawingphase start message to everyone
            // TODO: pick drawer and send drawer assignment message to them, with their choices
            // TODO: send non drawer assignment message to everyone else

            // send new round message to everyone with drawer, round number
            // then send just the drawer choices message

            rooms[data.gameId].gameState = GameStates.DRAWING

            // choose drawer
            if (rooms[data.gameId].drawerIndex >= Object.keys(rooms[data.gameId].players).length) rooms[data.gameId].drawerIndex = 0
            const drawer = Object.keys(rooms[data.gameId].players)[rooms[data.gameId].drawerIndex]
            rooms[data.gameId].drawerIndex++
            rooms[data.gameId].drawer = drawer;

            // update round number, send new round message
            const newRoundMessage = new SocketMessage(ToClientMessages.NEW_ROUND, { drawer, roundNum: 1 })
            rooms[data.gameId].roundNum = 1
            Object.values(rooms[data.gameId].players).forEach((player) => {
                player.ws.send(JSON.stringify(newRoundMessage))
            })


            console.log('drawer', drawer)

            // get the choices
            const choices = [] as Prompt[]
            Object.keys(rooms[data.gameId].players).forEach((playerName) => {
                if (playerName === drawer) return
                if (rooms[data.gameId].players[playerName].prompts.length === 0) return
                rooms[data.gameId].players[playerName].prompts.sort(() => 0.5 - Math.random())
                const choice = rooms[data.gameId].players[playerName].prompts.pop()
                if (choice === undefined) return
                choices.push(choice)
            })
            choices.sort(() => 0.5 - Math.random()) // randomize prompt order
            const choicesMessage = new SocketMessage(ToClientMessages.CHOICES, choices)
            rooms[data.gameId].players[drawer].ws.send(JSON.stringify(choicesMessage))
            console.log('choices', choices)
            
        }, 20) // <--- duration of prompts stage
    },
    [ToServerMessages.PROMPT]: (ws: ServerWebSocket<SocketPlayerData>, messageData: any) => {
        const { name, gameId, prompt } = messageData.data as PromptDataToServer
        if (rooms[gameId] === undefined || rooms[gameId].players[name] === undefined || rooms[gameId].gameState !== GameStates.PROMPTS) return
        
        rooms[gameId].players[name].prompts.push({ author: name, prompt })
        const promptSuccessMessage = new SocketMessage(ToClientMessages.PROMPT_SUCCESS, { prompt })
        ws.send(JSON.stringify(promptSuccessMessage)) // send prompt success message
    },
    [ToServerMessages.CHOOSE_PROMPT]: (ws: ServerWebSocket<SocketPlayerData>, messageData: any) => {
        const { name, gameId, prompt } = messageData.data as ChoosePromptDataToServer
        if (rooms[gameId] === undefined || rooms[gameId].players[name] === undefined || rooms[gameId].drawer !== name) return
        rooms[gameId].prompt = prompt
        Object.values(rooms[gameId].players).forEach((player) => {
            const drawerChosenMessage = new SocketMessage(ToClientMessages.DRAWER_CHOSEN, {})
            player.ws.send(JSON.stringify(drawerChosenMessage))
        })
    },
    [ToServerMessages.DRAW]: (ws: ServerWebSocket<SocketPlayerData>, messageData: any) => {
        const { width, height, pixels, gameId, name } = messageData.data as DrawDataToServer
        if (rooms[gameId] === undefined || rooms[gameId].players[name] === undefined || rooms[gameId].drawer !== name) return
        Object.values(rooms[gameId].players).forEach((player) => {
            if (player.name === name) return
            const drawMessage = new SocketMessage(ToClientMessages.DRAW, { width, height, pixels })
            player.ws.send(JSON.stringify(drawMessage))
            
        })
    },
    [ToServerMessages.GUESS]: (ws: ServerWebSocket<SocketPlayerData>, messageData: any) => {
        const { name, guess, gameId } = messageData.data as GuessDataToServer
        if (rooms[gameId] === undefined || rooms[gameId].players[name] === undefined || rooms[gameId].drawer === name || rooms[gameId].gameState !== GameStates.DRAWING) return
        const guessMessage = new SocketMessage(ToClientMessages.GUESS, { name, guess })
        rooms[gameId].players[rooms[gameId].drawer].ws.send(JSON.stringify(guessMessage))
    },
    [ToServerMessages.HINT]: (ws: ServerWebSocket<SocketPlayerData>, messageData: any) => {
        const { gameId, name, guess, type } = messageData.data as HintDataToServer
        if (rooms[gameId] === undefined || rooms[gameId].players[name] === undefined || rooms[gameId].drawer !== name || rooms[gameId].gameState !== GameStates.DRAWING) return
        const hintMessage = new SocketMessage(ToClientMessages.HINT, { guess, type })
        Object.values(rooms[gameId].players).forEach((player) => {
            if (player.name === name) return
            player.ws.send(JSON.stringify(hintMessage))
        })
    },
    [ToServerMessages.SELECT_WINNER]: (ws: ServerWebSocket<SocketPlayerData>, messageData: any) => {
        const { gameId, name, guess, winner } = messageData.data as SelectWinnerDataToServer
        if (rooms[gameId] === undefined || rooms[gameId].prompt === undefined || rooms[gameId].players[name] === undefined || rooms[gameId].drawer !== name || rooms[gameId].gameState !== GameStates.DRAWING || rooms[gameId].players[winner] === undefined) return
        // update: scores, 
        const oldPrompt = rooms[gameId].prompt as Prompt
        const promptAuthor = oldPrompt.author
        rooms[gameId].players[winner].score += 1
        rooms[gameId].players[promptAuthor].score += 1
        const winnerScore = rooms[gameId].players[winner].score
        const promptAuthorScore = rooms[gameId].players[promptAuthor].score
        // prompt to nothing, 
        rooms[gameId].prompt = undefined
        // round number,
        const roundNum = rooms[gameId].roundNum += 1
        // drawer, 
        if (rooms[gameId].drawerIndex >= Object.keys(rooms[gameId].players).length) rooms[gameId].drawerIndex = 0
        const drawer = Object.keys(rooms[gameId].players)[rooms[gameId].drawerIndex]
        rooms[gameId].drawerIndex++
        rooms[gameId].drawer = drawer;

        const endRoundMessage = new SocketMessage(ToClientMessages.END_ROUND, {
            roundNum, drawer, promptAuthor, winner, promptAuthorScore, winnerScore, guess, oldPrompt: oldPrompt.prompt
        })
        Object.values(rooms[gameId].players).forEach((player) => {
            player.ws.send(JSON.stringify(endRoundMessage))
        })

        // get the choices
        const choices = [] as Prompt[]
        Object.keys(rooms[gameId].players).forEach((playerName) => {
            if (playerName === drawer) return
            if (rooms[gameId].players[playerName].prompts.length === 0) return
            rooms[gameId].players[playerName].prompts.sort(() => 0.5 - Math.random())
            const choice = rooms[gameId].players[playerName].prompts.pop()
            if (choice === undefined) return
            choices.push(choice)
        })
        choices.sort(() => 0.5 - Math.random()) // randomize prompt order
        const choicesMessage = new SocketMessage(ToClientMessages.CHOICES, choices)
        rooms[gameId].players[drawer].ws.send(JSON.stringify(choicesMessage))
        

    },
    // [ToServerMessages.JOIN]: (ws: ServerWebSocket<SocketPlayerData>, messageData: any) => {
        
    // },
} as {[key: string]: (ws: ServerWebSocket<SocketPlayerData>, messageData: any) => void})

export default messageFunctionsGenerator