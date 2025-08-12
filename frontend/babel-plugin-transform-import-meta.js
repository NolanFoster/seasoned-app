module.exports = function() {
  return {
    visitor: {
      MemberExpression(path) {
        const node = path.node;
        if (
          node.object.type === 'MetaProperty' &&
          node.object.meta.name === 'import' &&
          node.object.property.name === 'meta' &&
          node.property.name === 'env'
        ) {
          path.replaceWith({
            type: 'MemberExpression',
            object: {
              type: 'Identifier',
              name: 'process'
            },
            property: {
              type: 'Identifier',
              name: 'env'
            }
          });
        }
      }
    }
  };
};