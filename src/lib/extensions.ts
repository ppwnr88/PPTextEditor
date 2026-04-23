import type { CommandContext, CommandDefinition } from "../types";

type CommandProvider = (context: CommandContext) => CommandDefinition[];

class ExtensionRegistry {
  private commandProviders: CommandProvider[] = [];

  registerCommandProvider(provider: CommandProvider) {
    this.commandProviders.push(provider);
  }

  getCommandProviders() {
    return this.commandProviders;
  }
}

export const extensionRegistry = new ExtensionRegistry();
