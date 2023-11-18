import { ServerWebSocket } from "bun"
import { CanvasData, CloseReasons, GameStates, JoinData, JoinResponse, ToServerMessages, Player, Room, SocketMessage, ToClientMessages, SocketPlayerData, StartDataToServer, PromptDataToServer, Prompt, ChoosePromptDataToServer, DrawDataToServer, GuessDataToServer, HintDataToServer, SelectWinnerDataToServer } from './types'
import { randomUUID } from "crypto"
import timer from "./timer"

const playerJoin = (room: Room, gameId: string, name: string, ws: ServerWebSocket<SocketPlayerData>) => {
    ws.data = { gameId, playerName: name }
    room.players[name] = new Player(name, ws)

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

const chooseDrawer = (room: Room) => {
    const playersByPrompts = Object.values(room.players).sort((a, b) => a.prompts.length - b.prompts.length)
    room.drawer = playersByPrompts[0].name
}


const messageFunctionsGenerator = (rooms: { [key: string]: Room }) => ({
    [ToServerMessages.JOIN]: (ws: ServerWebSocket<SocketPlayerData>, messageData: any) => {
        const data: JoinData = messageData.data
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
        const data: StartDataToServer = messageData.data

        const numPlayers = Object.keys(rooms[data.gameId].players).length
        let temp = data.rounds * (numPlayers - 1) / numPlayers
        if (temp % 1 === 0) temp += 1
        const promptsPP = Math.ceil(temp)

        if (rooms[data.gameId] === undefined || rooms[data.gameId].admin !== data.name) return

        if (Object.keys(rooms[data.gameId].players).length < 3) {
            const errorMessage = new SocketMessage(ToClientMessages.ERROR, { error: 'Need 3 or more players.' })
            ws.send(JSON.stringify(errorMessage))
            return
        }

        rooms[data.gameId].gameState = GameStates.PROMPTS
        rooms[data.gameId].promptsPP = promptsPP
        rooms[data.gameId].rounds = data.rounds
        const startMessage = new SocketMessage(ToClientMessages.START, { promptsPP })
        Object.values(rooms[data.gameId].players).forEach((player) => {
            player.ws.send(JSON.stringify(startMessage))
        })
        // timer((remaining) => {
        //     // send time remaining message to sockets
        //     Object.values(rooms[data.gameId].players).forEach((player) => {
        //         const timeRemainingMessage = new SocketMessage(ToClientMessages.TIME_REMAINING, {timeRemaining: remaining})
        //         player.ws.send(JSON.stringify(timeRemainingMessage))
        //     })
        // }, () => {
            
        //     // TODO: send drawingphase start message to everyone
        //     // TODO: pick drawer and send drawer assignment message to them, with their choices
        //     // TODO: send non drawer assignment message to everyone else

        //     // send new round message to everyone with drawer, round number
        //     // then send just the drawer choices message

        //     rooms[data.gameId].gameState = GameStates.DRAWING

        //     // choose drawer
        //     if (!chooseDrawer(rooms[data.gameId])) {
        //         // do something if someone has no prompts left
        //     }

        //     // update round number, send new round message
        //     const newRoundMessage = new SocketMessage(ToClientMessages.NEW_ROUND, { drawer: rooms[data.gameId].drawer, roundNum: 1 })
        //     rooms[data.gameId].roundNum = 1
        //     Object.values(rooms[data.gameId].players).forEach((player) => {
        //         player.ws.send(JSON.stringify(newRoundMessage))
        //     })


        //     console.log('drawer', rooms[data.gameId].drawer)

        //     // get the choices
        //     const choices: Prompt[] = []
        //     Object.keys(rooms[data.gameId].players).forEach((playerName) => {
        //         if (playerName === rooms[data.gameId].drawer) return
        //         if (rooms[data.gameId].players[playerName].prompts.length === 0) return
        //         rooms[data.gameId].players[playerName].prompts.sort(() => 0.5 - Math.random())
        //         const choice = rooms[data.gameId].players[playerName].prompts.pop()
        //         if (choice === undefined) return
        //         choices.push(choice)
        //     })
        //     choices.sort(() => 0.5 - Math.random()) // randomize prompt order
        //     const choicesMessage = new SocketMessage(ToClientMessages.CHOICES, choices)
        //     rooms[data.gameId].players[rooms[data.gameId].drawer].ws.send(JSON.stringify(choicesMessage))
        //     console.log('choices', choices)
            
        // }, 20) // <--- duration of prompts stage
    },
    [ToServerMessages.PROMPT]: (ws: ServerWebSocket<SocketPlayerData>, messageData: any) => {
        const { name, gameId, prompt }: PromptDataToServer = messageData.data
        if (rooms[gameId] === undefined || rooms[gameId].players[name] === undefined || rooms[gameId].gameState !== GameStates.PROMPTS) return
        
        if (rooms[gameId].players[name].prompts.length >= rooms[gameId].promptsPP) {
            const errorMessage = new SocketMessage(ToClientMessages.ERROR, { error: 'You have already submitted enough prompts.' })
            ws.send(JSON.stringify(errorMessage))
            return
        }

        rooms[gameId].players[name].prompts.push({ author: name, prompt })
        const promptSuccessMessage = new SocketMessage(ToClientMessages.PROMPT_SUCCESS, { prompt })
        ws.send(JSON.stringify(promptSuccessMessage)) // send prompt success message

        // if everyone has submitted enough prompts, start the drawing phase
        if (Object.values(rooms[gameId].players).every(player => player.prompts.length >= rooms[gameId].promptsPP)) {
        
            rooms[gameId].gameState = GameStates.DRAWING

            // choose drawer
            chooseDrawer(rooms[gameId])

            // update round number, send new round message
            const newRoundMessage = new SocketMessage(ToClientMessages.NEW_ROUND, { drawer: rooms[gameId].drawer, roundNum: 1 })
            rooms[gameId].roundNum = 1
            Object.values(rooms[gameId].players).forEach((player) => {
                player.ws.send(JSON.stringify(newRoundMessage))
            })


            console.log('drawer', rooms[gameId].drawer)

            // get the choices
            const choices: Prompt[] = []
            Object.keys(rooms[gameId].players).forEach((playerName) => {
                if (playerName === rooms[gameId].drawer) return
                if (rooms[gameId].players[playerName].prompts.length === 0) return
                rooms[gameId].players[playerName].prompts.sort(() => 0.5 - Math.random())
                const choice = rooms[gameId].players[playerName].prompts.pop()
                if (choice === undefined) return
                choices.push(choice)
            })
            choices.sort(() => 0.5 - Math.random()) // randomize prompt order
            const choicesMessage = new SocketMessage(ToClientMessages.CHOICES, choices)
            rooms[gameId].players[rooms[gameId].drawer].ws.send(JSON.stringify(choicesMessage))
            console.log('choices', choices)
        }


    },
    [ToServerMessages.CHOOSE_PROMPT]: (ws: ServerWebSocket<SocketPlayerData>, messageData: any) => {
        const { name, gameId, prompt }: ChoosePromptDataToServer = messageData.data
        if (rooms[gameId] === undefined || rooms[gameId].players[name] === undefined || rooms[gameId].drawer !== name) return
        rooms[gameId].prompt = prompt
        Object.values(rooms[gameId].players).forEach((player) => {
            const drawerChosenMessage = new SocketMessage(ToClientMessages.DRAWER_CHOSEN, {})
            player.ws.send(JSON.stringify(drawerChosenMessage))
        })
    },
    [ToServerMessages.DRAW]: (ws: ServerWebSocket<SocketPlayerData>, messageData: any) => {
        const { width, height, pixels, gameId, name }: DrawDataToServer = messageData.data
        if (rooms[gameId] === undefined || rooms[gameId].players[name] === undefined || rooms[gameId].drawer !== name) return
        Object.values(rooms[gameId].players).forEach((player) => {
            if (player.name === name) return
            const drawMessage = new SocketMessage(ToClientMessages.DRAW, { width, height, pixels })
            player.ws.send(JSON.stringify(drawMessage))
            
        })
    },
    [ToServerMessages.GUESS]: (ws: ServerWebSocket<SocketPlayerData>, messageData: any) => {
        const { name, guess, gameId }: GuessDataToServer = messageData.data
        if (rooms[gameId] === undefined || rooms[gameId].players[name] === undefined || rooms[gameId].drawer === name || rooms[gameId].gameState !== GameStates.DRAWING) return
        const guessMessage = new SocketMessage(ToClientMessages.GUESS, { name, guess })
        rooms[gameId].players[rooms[gameId].drawer].ws.send(JSON.stringify(guessMessage))
    },
    [ToServerMessages.HINT]: (ws: ServerWebSocket<SocketPlayerData>, messageData: any) => {
        const { gameId, name, guess, type }: HintDataToServer = messageData.data
        if (rooms[gameId] === undefined || rooms[gameId].players[name] === undefined || rooms[gameId].drawer !== name || rooms[gameId].gameState !== GameStates.DRAWING) return
        const hintMessage = new SocketMessage(ToClientMessages.HINT, { guess, type })
        Object.values(rooms[gameId].players).forEach((player) => {
            if (player.name === name) return
            player.ws.send(JSON.stringify(hintMessage))
        })
    },
    [ToServerMessages.SELECT_WINNER]: (ws: ServerWebSocket<SocketPlayerData>, messageData: any) => {
        const { gameId, name, guess, winner }: SelectWinnerDataToServer = messageData.data
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
        chooseDrawer(rooms[gameId])

        // get the choices
        const choices: Prompt[] = []

        Object.keys(rooms[gameId].players).forEach((playerName) => {
            if (playerName === rooms[gameId].drawer) return
            if (rooms[gameId].players[playerName].prompts.length === 0) return
            rooms[gameId].players[playerName].prompts.sort(() => 0.5 - Math.random())
            const choice = rooms[gameId].players[playerName].prompts.pop()
            if (choice === undefined) return
            choices.push(choice)
        })

        // send end round message to everyone
        const endRoundMessage = new SocketMessage(ToClientMessages.END_ROUND, {
            roundNum, drawer: rooms[gameId].drawer, promptAuthor, winner, promptAuthorScore, winnerScore, guess, oldPrompt: oldPrompt.prompt
        })

        if (choices.length < Object.keys(rooms[gameId].players).length - 1 || roundNum > rooms[gameId].rounds) {
            // end game
            rooms[gameId].gameState = GameStates.OVER
            const namesAndScores = Object.values(rooms[gameId].players).sort((a, b) => b.score - a.score).map(p => ({ name: p.name, score: p.score }))
            const endGameMessage = new SocketMessage(ToClientMessages.GAME_OVER, namesAndScores)
            Object.values(rooms[gameId].players).forEach((player) => {
                player.ws.send(JSON.stringify(endGameMessage))
            })
            endRoundMessage.data = { ...endRoundMessage.data, over: true }
            Object.values(rooms[gameId].players).forEach((player) => {
                player.ws.send(JSON.stringify(endRoundMessage))
            })
            return
        }

        Object.values(rooms[gameId].players).forEach((player) => {
            player.ws.send(JSON.stringify(endRoundMessage))
        })

        choices.sort(() => 0.5 - Math.random()) // randomize prompt order
        const choicesMessage = new SocketMessage(ToClientMessages.CHOICES, choices)
        rooms[gameId].players[rooms[gameId].drawer].ws.send(JSON.stringify(choicesMessage))
        

    },
    [ToServerMessages.PLAY_AGAIN]: (ws: ServerWebSocket<SocketPlayerData>, messageData: any) => {
        const { gameId, name }: { gameId: string, name: string } = messageData.data
        if (rooms[gameId] === undefined || rooms[gameId].players[name] === undefined || rooms[gameId].gameState !== GameStates.OVER || name !== rooms[gameId].admin) return
        
        Object.values(rooms[gameId].players).forEach((player) => {
            player.prompts = []
            player.score = 0
        })
        rooms[gameId].gameState = GameStates.OPEN
        rooms[gameId].roundNum = -1
        rooms[gameId].prompt = undefined
        rooms[gameId].drawer = ""

        const joinSuccessMessage = new SocketMessage(ToClientMessages.JOIN_SUCCESS, {
            players: Object.keys(rooms[gameId].players),
            admin: rooms[gameId].admin,
            gameId
        })
        Object.values(rooms[gameId].players).forEach((player) => {
            player.ws.send(JSON.stringify(joinSuccessMessage))
        })
        
    },
    [ToServerMessages.KICK]: (ws: ServerWebSocket<SocketPlayerData>, messageData: any) => {
        const { gameId, name, playerToKick }: { gameId: string, name: string, playerToKick: string } = messageData.data
        if (rooms[gameId] === undefined || rooms[gameId].players[name] === undefined || rooms[gameId].players[playerToKick] === undefined || rooms[gameId].gameState !== GameStates.OPEN || name !== rooms[gameId].admin) return
        rooms[gameId].players[playerToKick].ws.close(CloseReasons.KICKED)
        delete rooms[gameId].players[playerToKick]
        const kickMessage = new SocketMessage(ToClientMessages.LEAVE, { playerLeaving: playerToKick, admin: rooms[gameId].admin, drawer: rooms[gameId].drawer })
        Object.values(rooms[gameId].players).forEach((player) => {
            player.ws.send(JSON.stringify(kickMessage))
        })
    }
    // [ToServerMessages.JOIN]: (ws: ServerWebSocket<SocketPlayerData>, messageData: any) => {
        
    // },
} as {[key: string]: (ws: ServerWebSocket<SocketPlayerData>, messageData: any) => void})

export default messageFunctionsGenerator