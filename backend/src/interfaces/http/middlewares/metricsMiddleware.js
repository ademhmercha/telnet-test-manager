function createMetricsMiddleware(httpRequestsTotal, httpRequestDuration) {
  return function metricsMiddleware(req, res, next) {
    const end = httpRequestDuration.startTimer();
    res.on('finish', () => {
      const route = req.route ? req.route.path : req.path;
      httpRequestsTotal.inc({ method: req.method, route, status: res.statusCode });
      end({ method: req.method, route, status: res.statusCode });
    });
    next();
  };
}

module.exports = { createMetricsMiddleware };
