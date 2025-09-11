// Convenience re-exports for UI layer
module.exports = {
  ...require('./embeds'),
  ...require('./components'),
  ...require('./state'),
  ...require('./format'),
  theme: require('./theme')
};

