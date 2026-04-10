let counter = 0;
module.exports = {
  v4: () => `mock-uuid-${++counter}`,
};
