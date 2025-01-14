import { Hono } from "hono";

import DevController from './controllers/dev.controller'
import SearchController from './controllers/search.controller'

export const routes = new Hono();

routes.get('/devs', DevController.index);
routes.post('/devs', DevController.store);
routes.put('/devs/:dev_id/update', DevController.update);
routes.delete('/devs/:dev_id', DevController.destroy);

routes.get('/health-check', (context) => context.json({ message: 'ok' }))

routes.get('/search', SearchController.index);
