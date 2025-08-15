import { FastifyInstance, RawServerBase } from 'fastify';

export default async function globalErrorHandler<T extends RawServerBase>(
  app: FastifyInstance<T>
) {
  app.setErrorHandler(async (error, request, reply) => {
    app.log.error(error);

    // Handle specific error types
    if (error.statusCode === 413) {
      return reply.status(413).send({
        error: 'File too large',
        message: 'The uploaded file exceeds the maximum allowed size',
      });
    }

    if (error.statusCode === 400) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: error.message,
      });
    }

    // Generic server error
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Something went wrong on our end',
    });
  });
}
