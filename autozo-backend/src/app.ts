import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { env } from './config/env';
import { errorHandler, notFound } from './middleware/error';
import { parseRange } from './utils/range';
import { findImage, isThumbName, thumbName } from './utils/imageStore';
import routes from './routes';
import { ensureSettings } from './services/settings.service';

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1); // running behind nginx / a load balancer

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: env.CORS_ORIGINS === '*' ? true : env.CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
  }),
);
app.use(compression());
app.use(express.json({ limit: '1mb' }));
/* Uploaded images are served from the database; files written to disk by
   older builds are still served below for as long as they exist. */
app.get('/uploads/products/:name', async (req, res, next) => {
  try {
    const { name } = req.params;
    // `?w=480` asks for the small copy made at upload; photos without one get the original.
    const wantsThumb = req.query.w !== undefined && !isThumbName(name) && !/\.(mp4|webm)$/i.test(name);
    const thumb = wantsThumb ? await findImage(thumbName(name)) : null;
    const image = thumb ?? (await findImage(name));
    if (!image) return next();
    const headers: Record<string, string> = {
      'Content-Type': image.contentType,
      'Accept-Ranges': 'bytes',
      // A stand-in original is cached for a day only, so the small copy is picked up once it is made.
      'Cache-Control': wantsThumb && !thumb ? 'public, max-age=86400' : 'public, max-age=2592000, immutable',
    };
    if (!req.headers.range) {
      const whole = await image.buffer();
      if (whole) {
        res.set({ ...headers, 'Content-Length': String(whole.length) }).end(whole);
        return;
      }
    }
    // Videos are played and skipped through with Range requests (Safari insists on them).
    const range = parseRange(req.headers.range, image.length);
    if (range === 'unsatisfiable') {
      res.status(416).set({ 'Content-Range': `bytes */${image.length}` }).end();
      return;
    }
    if (range) {
      const { start, end } = range;
      res.status(206).set({ ...headers, 'Content-Range': `bytes ${start}-${end}/${image.length}`, 'Content-Length': String(end - start + 1) });
      image.open({ start, end }).on('error', next).pipe(res);
      return;
    }
    res.set({ ...headers, 'Content-Length': String(image.length) });
    image.open().on('error', next).pipe(res);
  } catch (error) {
    next(error);
  }
});
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads'), { maxAge: '30d', immutable: true }));
// Latest app APKs, refreshed in place by update-apks.sh (deploy runs it), so the names never change.
app.use(
  '/downloads',
  express.static(path.resolve(process.cwd(), 'downloads'), {
    maxAge: '10m',
    setHeaders: (res) => res.setHeader('Content-Disposition', 'attachment'),
  }),
);
if (env.NODE_ENV !== 'test') app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use(
  '/api',
  rateLimit({ windowMs: 15 * 60 * 1000, limit: 1000, standardHeaders: true, legacyHeaders: false }),
);

app.get('/health', (_req, res) => {
  res.json({ success: true, service: 'autozo-backend', uptime: process.uptime() });
});

app.use('/api/v1', ensureSettings, routes);

app.use(notFound);
app.use(errorHandler);

export default app;
