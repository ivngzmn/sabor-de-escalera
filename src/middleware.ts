import { defineMiddleware } from 'astro:middleware';
import { handleAccountRequest } from './server/account-request';
export const onRequest = defineMiddleware(({ request }, next) => handleAccountRequest(request, next));
