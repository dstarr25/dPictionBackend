import Server from './apiServer'

const router = Server.router()

router.get('/test', (req: Request) => {
    return new Response(JSON.stringify({ message: "Blog!" }))
})

export default router