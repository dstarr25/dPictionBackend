import { ServerWebSocket } from "bun"
import { resourceLimits } from "worker_threads"

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
        let clients: ServerWebSocket<unknown>[] = []
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
                async message(ws, data) {
                    // console.log(data)
                    clients.forEach((client) => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            console.log("sending data to a socket")
                            client.send(data)
                        } else {
                            console.log("this socket was the sender, not sending data to it :)")
                        }
                    })
                },
                open(ws) {
                    console.log(`client connected with remoteAddress: ${ws.remoteAddress}`)
                    clients.push(ws)
                },
                close(ws) {
                    const i = clients.indexOf(ws)
                    if (i < 0 || i > clients.length) return
                    clients.splice(i, 1)
                    console.log('closed a client')
                }
                
            },

        })
    }
}

const router = () => new Router()
const server = () => new Server()

const ApiServer = { router, server }

export default ApiServer