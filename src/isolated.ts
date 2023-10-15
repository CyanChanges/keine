import {Context as IContext, Plugin as IPlugin} from 'cordis2'
import {Context, Plugin} from 'cordis'

// export type IsolatedContext<C extends Context, I = any> = Exclude<C extends Context<I> ? IContext<I> & {isolated: true} : null, (IContext<I> & Context<I>) >
export type IsolatedContext<C extends Context> = C extends Context<infer S extends any> ? IContext<S> : never
export type IsolatedPlugin<P extends Plugin> = P extends Plugin<infer S> ? IPlugin<IsolatedContext<S>> : never
