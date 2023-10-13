const timer = (tick: (remaining: number) => void, done: () => void, times: number) => {
    let interval = setInterval(() => {
        if (times <= 0) {
            clearInterval(interval)
            done()
            return
        }
        tick(times--)
    }, 1000)
}

export default timer