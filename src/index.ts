import {Context, Schema} from 'koishi'
import {Keine} from "./keine";

export const name = 'keine'

export {Keine} from './keine'

export interface Config {
}

export const Config: Schema<Config> = Schema.object({})

export function apply(ctx: Context) {
    // write your plugin here
    ctx.plugin(Keine)

}
