export const environment = {
  production: false,
  version: "0.18.0",
  logging: {
    enabled: true,
    minLevel: "debug",
    consoleOutput: true,
    memoryOutput: true,
    fileOutput: false,
    fileLogLevel: "error",
    levels: {
      debug: true,
      info: true,
      warn: true,
      error: true,
      success: true,
    },
  },
  gitRepoName: "TaskFlow",
  githubUser: "TechCraft-Solutions",
  nameProduct: "Task Flow",
  yearCreate: 2025,
  companyName: "TechCraft Solutions",
  authors: [
    {
      name: "Dmitriy303",
      email: "rusnakdima03@gmail.com",
      url: "https://github.com/rusnakdima",
    },
  ],
};
