import { Context, Service } from 'koishi'
import cordis, { GetEvents, Parameters, ReturnType, ThisType, isBailed } from "cordis";
import { Promisify } from "cosmokit";

export const name = 'keine'

declare module '.' {
  interface Keine {
    parallel<K extends keyof GetEvents<typeof this.caller>>(name: K, ...args: Parameters<GetEvents<typeof this.caller>[K]>): Promise<void>;
    parallel<K extends keyof GetEvents<typeof this.caller>>(thisArg: ThisType<GetEvents<typeof this.caller>[K]>, name: K, ...args: Parameters<GetEvents<typeof this.caller>[K]>): Promise<void>;
    emit<K extends keyof GetEvents<typeof this.caller>>(name: K, ...args: Parameters<GetEvents<typeof this.caller>[K]>): void;
    emit<K extends keyof GetEvents<typeof this.caller>>(thisArg: ThisType<GetEvents<typeof this.caller>[K]>, name: K, ...args: Parameters<GetEvents<typeof this.caller>[K]>): void;
    serial<K extends keyof GetEvents<typeof this.caller>>(name: K, ...args: Parameters<GetEvents<typeof this.caller>[K]>): Promisify<ReturnType<GetEvents<typeof this.caller>[K]>>;
    serial<K extends keyof GetEvents<typeof this.caller>>(thisArg: ThisType<GetEvents<typeof this.caller>[K]>, name: K, ...args: Parameters<GetEvents<typeof this.caller>[K]>): Promisify<ReturnType<GetEvents<typeof this.caller>[K]>>;
    on<K extends keyof GetEvents<typeof this.caller>>(name: K, listener: GetEvents<typeof this.caller>[K], prepend?: boolean): () => boolean;
    once<K extends keyof GetEvents<typeof this.caller>>(name: K, listener: GetEvents<typeof this.caller>[K], prepend?: boolean): () => boolean;
    off<K extends keyof GetEvents<typeof this.caller>>(name: K, listener: GetEvents<typeof this.caller>[K]): boolean;
  }
}

export class Keine extends Service {
  constructor(protected ctx: Context) {
    super(ctx,  "keine", true)
  }

  plugin<S extends cordis.Plugin<cordis.Context.Configured<typeof this.caller>>, T extends cordis.Plugin.Config<S>>(plugin: S, config?: boolean | T): cordis.ForkScope<cordis.Context.Configured<typeof this.caller, T>> {
    return this.caller.plugin(plugin, config)
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
    const result = this.bail(this.caller, 'internal/hook', name, listener, prepend)
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


  register(label: string, hooks: [Context, any][], listener: any, prepend?: boolean) {
    const maxListeners = this.root.config.maxListeners!
    if (hooks.length >= maxListeners!) {
      this.root.emit('internal/warning', `max listener count (${maxListeners!}) for ${label} exceeded, which may be caused by a memory leak`)
    }

    const caller = this[Context.current]
    const method = prepend ? 'unshift' : 'push'
    hooks[method]([caller, listener])
    return caller.state.collect(label, () => this.unregister(hooks, listener))
  }

  unregister(hooks: [Context, any][], listener: any) {
    const index = hooks.findIndex(([context, callback]) => callback === listener)
    if (index >= 0) {
      hooks.splice(index, 1)
      return true
    }
  }


}

Context.service(name, Keine)
