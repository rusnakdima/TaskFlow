export class MongoConnectionService {
  checkConnection = () => ({ subscribe: (fn: Function) => fn(true) });
}
