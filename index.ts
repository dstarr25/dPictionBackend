import ApiServer from './wsServer'
import router from './routes'

const server = ApiServer.server()

server.useRoutes('/', router)

server.get('/urmom', (req: Request) => {
    return new Response(JSON.stringify({urmom: "hey there friend"}))
})

server.listen(3000)