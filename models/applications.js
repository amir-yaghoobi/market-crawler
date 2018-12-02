const Sequelize = require('sequelize')

module.exports = (sequelize) => {
  const User = sequelize.define('applications', {
    bundleId: {
      type: Sequelize.STRING,
      primaryKey: true
    },
    category: {
      type: Sequelize.STRING,
      allowNull: false
    },
    appName: {
      type: Sequelize.STRING,
      allowNull: false
    },
    cafeBazaarPrice: {
      type: Sequelize.STRING,
      allowNull: true
    },
    cafeBazaarInstalls: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    playStoreInstalls: {
      type: Sequelize.INTEGER,
      allowNull: true,
    },
    playStorePrice: {
      type: Sequelize.STRING,
      allowNull: true
    },
    createdAt: {
      type: Sequelize.DATE,
      defaultValue: Sequelize.NOW,
      allowNull: false
    },
  });

  return User
}

