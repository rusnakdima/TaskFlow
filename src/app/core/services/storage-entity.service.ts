export class BaseStorageService {
  todos = { set: () => {}, update: () => {}, value: [], () => () => [] };
  tasks = { set: () => {}, update: () => {}, value: [], () => () => [] };
  subtasks = { set: () => {}, update: () => {}, value: [], () => () => [] };
  comments = { set: () => {}, update: () => {}, value: [], () => () => [] };
  chats = { set: () => {}, update: () => {}, value: [], () => () => [] };
  categories = { set: () => {}, update: () => {}, value: [], () => () => [] };
  profiles = { set: () => {}, update: () => {}, value: [], () => () => [] };
  publicProfiles = { set: () => {}, update: () => {}, value: [], () => () => [] };
  users = { set: () => {}, update: () => {}, value: [], () => () => [] };
  rooms = { set: () => {}, update: () => {}, value: [], () => () => [] };
  localCategories = { set: () => {}, update: () => {}, value: [], () => () => [] };
  cloudCategories = { set: () => {}, update: () => {}, value: [], () => () => [] };
  privateTodos = { set: () => {}, update: () => {}, value: [], () => () => [] };
  sharedTodos = { set: () => {}, update: () => {}, value: [], () => () => [] };
  publicTodos = { set: () => {}, update: () => {}, value: [], () => () => [] };
}
