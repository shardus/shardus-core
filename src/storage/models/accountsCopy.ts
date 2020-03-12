import { Sequelize } from 'sequelize'

const accountsCopy = [
  'accountsCopy',
  {
    accountId: { type: Sequelize.STRING, allowNull: false, unique: 'compositeIndex' },
    cycleNumber: { type: Sequelize.STRING, allowNull: false, unique: 'compositeIndex' },
    data: { type: Sequelize.JSON, allowNull: false },
    timestamp: { type: Sequelize.BIGINT, allowNull: false },
    hash: { type: Sequelize.STRING, allowNull: false }
  }
]

export default accountsCopy