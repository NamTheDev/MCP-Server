import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingHttpHeaders } from "node:http";

type RequestContext = { headers: IncomingHttpHeaders };

export const reqContext = new AsyncLocalStorage<RequestContext>();

export function currentHeaders(): IncomingHttpHeaders {
  return reqContext.getStore()?.headers ?? {};
}
