import {Context, defineProperty, resolveConfig, Service} from 'koishi'
import * as cordis from 'cordis'
import {GetEvents, Parameters, ReturnType, ThisType, isBailed} from "cordis";
import {Promisify} from "cosmokit";
import {IsolatedPlugin, IsolatedContext} from "./isolated";
import * as isolatedCordis from 'cordis2'

export const name = 'keine'

declare module './keine' {
    interface Keine {
        [Context.events]: cordis.Events<typeof this.caller.root>

        parallel<K extends keyof GetEvents<typeof this.caller>>(name: K, ...args: Parameters<GetEvents<typeof this.caller>[K]>): Promise<void>;

        parallel<K extends keyof GetEvents<typeof this.caller>>(thisArg: ThisType<GetEvents<typeof this.caller>[K]>, name: K, ...args: Parameters<GetEvents<typeof this.caller>[K]>): Promise<void>;

        emit<K extends keyof GetEvents<typeof this.caller>>(name: K, ...args: Parameters<GetEvents<typeof this.caller>[K]>): void;

        emit<K extends keyof GetEvents<typeof this.caller>>(thisArg: ThisType<GetEvents<typeof this.caller>[K]>, name: K, ...args: Parameters<GetEvents<typeof this.caller>[K]>): void;

        serial<K extends keyof GetEvents<typeof this.caller>>(name: K, ...args: Parameters<GetEvents<typeof this.caller>[K]>): Promisify<ReturnType<GetEvents<typeof this.caller>[K]>>;

        serial<K extends keyof GetEvents<typeof this.caller>>(thisArg: ThisType<GetEvents<typeof this.caller>[K]>, name: K, ...args: Parameters<GetEvents<typeof this.caller>[K]>): Promisify<ReturnType<GetEvents<typeof this.caller>[K]>>;

        on<K extends keyof GetEvents<typeof this.caller>>(name: K, listener: GetEvents<typeof this.caller>[K], prepend?: boolean): () => boolean;

        once<K extends keyof GetEvents<typeof this.caller>>(name: K, listener: GetEvents<typeof this.caller>[K], prepend?: boolean): () => boolean;

        off<K extends keyof GetEvents<typeof this.caller>>(name: K, listener: GetEvents<typeof this.caller>[K]): boolean;

        bail<K extends keyof GetEvents<typeof this.caller>>(name: K, ...args: Parameters<GetEvents<typeof this.caller>[K]>): ReturnType<GetEvents<typeof this.caller>[K]>

        bail<K extends keyof GetEvents<typeof this.caller>>(thisArg: ThisType<GetEvents<typeof this.caller>[K]>, name: K, ...args: Parameters<GetEvents<typeof this.caller>[K]>): ReturnType<GetEvents<typeof this.caller>[K]>
    }
}

declare module 'koishi' {
    interface Context {
        isolated?: IsolatedContext<this>
    }
}

export class Keine extends Service {
    private ictx: isolatedCordis.Context

    static isolated = Symbol('isolated')

    get registry() {
        return this.ictx.registry
    }

    constructor(protected ctx: Context) {
        super(ctx, "keine")


        isolatedCordis.Context.mixin('lifecycle', {
            methods: cordis.Lifecycle.methods
        })
        
        this.ictx = new isolatedCordis.Context({})
        this.ictx[Keine.isolated] = true
        this.ictx['loader'] = this.ctx.root.loader
        this.ictx.root = this.ctx.root as any

        // this.ictx.plugin(isolatedCordis.Registry)
        for (let symbol of Object.getOwnPropertySymbols(this.ictx)) {
            if (symbol.description == 'registry') {
                if (!this.ictx.registry)
                    defineProperty(this.ictx, 'registry', this.ictx[symbol])
                this.ictx.mapping['registry'] = symbol
            }
        }

        this.ictx.lifecycle = this.ctx.root.lifecycle as any
    }

    async start() {
        // setTimeout(()=>{
        //     this.ictx.start().then()
        // })
        // this['old_getHooks'] = this.ctx.root.lifecycle.getHooks

        // const self = this

        await this.ictx.runtime.start()

        // this.ictx.registry = this.registry = new isolatedCordis.Registry(this.ictx, {})
    }

    async stop() {
        this.ctx.root.lifecycle.getHooks = this['old_getHooks']
        await this.ictx.runtime.dispose()
    }

    private createIsolatedContext<T>(ctx: cordis.Context<T>): IsolatedContext<typeof ctx> {
        if (ctx['isolated']) return ctx['isolated']
        let context: isolatedCordis.Context<T> =
            Object.assign(ctx, this.ictx.runtime.fork(this.ictx, ctx.config).ctx) as any
        // context.lifecycle = ctx.lifecycle as any
        ctx['isolated'] = context
        return context
    }

    plugin<S extends cordis.Plugin<cordis.Context.Configured<typeof this.caller>>, T extends cordis.Plugin.Config<S>>(plugin: S, config?: boolean | T): cordis.ForkScope<cordis.Context.Configured<typeof this.caller, T>> {
        let iplugin: IsolatedPlugin<typeof plugin> = plugin as any
        // check if it's a valid plugin
        this.registry.resolve(plugin as any)

        // resolve plugin config
        config = resolveConfig(plugin, config)
        if (!config) return

        // check duplication
        let context = this.createIsolatedContext(this.caller)

        let runtime = this.registry.get(iplugin)
        if (runtime) {
            if (!runtime.isForkable) {
                this.root.emit('internal/warning', `duplicate plugin detected: ${plugin.name}`)
            }
            return runtime.fork(context, config) as any
        }

        runtime = new isolatedCordis.MainScope(this.registry, iplugin, config)
        return runtime.fork(context, config) as any
    }

    async parallel(...args: any[]) {
        const thisArg = typeof args[0] === 'object' ? args.shift() : null
        const name = args.shift()
        await Promise.all([...this.getHooks(name, thisArg)].map(async (callback) => {
            await callback.apply(thisArg, args)
        }))
    }

    emit(...args: any[]) {
        const thisArg = typeof args[0] === 'object' ? args.shift() : null
        const name = args.shift()
        for (const callback of this.getHooks(name, thisArg)) {
            callback.apply(thisArg, args)
        }
    }

    async serial(...args: any[]) {
        const thisArg = typeof args[0] === 'object' ? args.shift() : null
        const name = args.shift()
        for (const callback of this.getHooks(name, thisArg)) {
            const result = await callback.apply(thisArg, args)
            if (isBailed(result)) return result
        }
    }

    bail<K extends keyof GetEvents<typeof this.caller>>(name: K, ...args: Parameters<GetEvents<typeof this.caller>[K]>): ReturnType<GetEvents<typeof this.caller>[K]>;
    bail<K extends keyof GetEvents<typeof this.caller>>(thisArg: ThisType<GetEvents<typeof this.caller>[K]>, name: K, ...args: Parameters<GetEvents<typeof this.caller>[K]>): ReturnType<GetEvents<typeof this.caller>[K]>;
    bail(...args: any[]) {
        const thisArg = typeof args[0] === 'object' ? args.shift() : null
        const name = args.shift()
        for (const callback of this.getHooks(name, thisArg)) {
            const result = callback.apply(thisArg, args)
            if (isBailed(result)) return result
        }
    }

    on(name: keyof any, listener: (...args: any) => any, prepend = false) {
        // handle special events
        const result = this.bail(this.caller.lifecycle, 'internal/hook', name as any, listener, prepend)
        if (result) return result

        const hooks = this._hooks[name] ||= []
        const label = typeof name === 'string' ? `event <${name}>` : 'event (Symbol)'
        return this.register(label, hooks, listener, prepend)
    }

    once(name: keyof any, listener: (...args: any) => any, prepend = false) {
        const dispose = this.on(name, function (...args: any[]) {
            dispose()
            return listener.apply(this, args)
        }, prepend)
        return dispose
    }

    off(name: keyof any, listener: (...args: any) => any) {
        return this.unregister(this._hooks[name] || [], listener)
    }

    get _hooks() {
        return this.caller.lifecycle._hooks
    }

    private get root() {
        return this.caller.root
    }

    getHooks(name: keyof any, thisArg?: object) {
        return this.caller.lifecycle.getHooks(name, thisArg)
    }


    register(label: string, hooks: [cordis.Context, (...args: any[]) => any][], listener: any, prepend?: boolean) {
        const maxListeners = this.root.config.maxListeners!
        if (hooks.length >= maxListeners!) {
            this.root.emit('internal/warning', `max listener count (${maxListeners!}) for ${label} exceeded, which may be caused by a memory leak`)
        }

        const caller = this[Context.current]
        const method = prepend ? 'unshift' : 'push'
        hooks[method]([caller, listener])
        return caller.state.collect(label, () => this.unregister(hooks, listener))
    }

    unregister(hooks: [cordis.Context, ((...args: any[]) => any)][], listener: any) {
        const index = hooks.findIndex(([context, callback]) => callback === listener)
        if (index >= 0) {
            hooks.splice(index, 1)
            return true
        }
    }


}

declare module 'koishi' {
    interface Context {
        keine: Keine
    }
}

Context.service(name, Keine)
