/**
 * PM2 ecosystem file for running the bot in production.
 * Includes log rotation-friendly settings; install pm2 and pm2-logrotate module:
 *   npm i -g pm2
 *   pm2 install pm2-logrotate
 *
 * Use: pm2 start ecosystem.config.js --env production
 */
module.exports = {
  apps: [
    {
      name: 'miyako-bot',
      script: './index.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      // Log files
      output: './logs/out.log',
      error: './logs/err.log',
      log_date_format: 'YYYY-MM-DD HH:mm Z',
      // Maximum memory before restart
      max_memory_restart: '512M',
    },
  ],
};
