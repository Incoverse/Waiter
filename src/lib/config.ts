/*
  * Copyright (c) 2025 Inimi | InimicalPart | Incoverse
  *
  * This program is free software: you can redistribute it and/or modify
  * it under the terms of the GNU General Public License as published by
  * the Free Software Foundation, either version 3 of the License, or
  * (at your option) any later version.
  *
  * This program is distributed in the hope that it will be useful,
  * but WITHOUT ANY WARRANTY; without even the implied warranty of
  * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
  * GNU General Public License for more details.
  *
  * You should have received a copy of the GNU General Public License
  * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { AppInterface } from "@src/interfaces/appInterface.js";
import { DrBotGlobal } from "@src/interfaces/global.js";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import JsonCParser from "jsonc-parser";


declare const global: DrBotGlobal;

export const maxVersion = 2

export async function updateConfig(path: string): Promise<{
    updated: boolean;
    fatal?: boolean;
}> {

    let config: Partial<AppInterface["config"]>;
    try {
        config = JsonCParser.parse(readFileSync(path, { encoding: "utf-8" }))
    } catch (error) {
        global.logger.error(`Failed to read config file: ${error}`, "CONFIG");
        return { updated: false, fatal: true };
    }

    if (!config.version) {
        global.logger.error(`Config version is not defined. You're using an outdated version of the config. Please update to the latest version.`, "CONFIG");
        return { updated: false, fatal: true };
    }

    if (config.version === maxVersion) return { updated: false };
    if (config.version > maxVersion) {
        global.logger.debugWarn(`Config version is higher than the latest supported version. Instabilites may occur!`, "CONFIG");
        return { updated: false };
    }

    let oldVersion = config.version;
    let newConfig: any = config;
    
    // Backup the config to config.bkup.jsonc
    try {
        const backupPath = join(global.dirName, "..", "config.bkup.jsonc");
        writeFileSync(backupPath, JSON.stringify(newConfig, null, 2));
        global.logger.debug(`Backup of config created at ${backupPath}`, "CONFIG");
    } catch (error) {
        global.logger.debugError(`Failed to create backup of config: ${error}`, "CONFIG");
    }

    while (newConfig.version < maxVersion) {
        const updateMethod = updateMethods[`${newConfig.version} -> ${newConfig.version + 1}`];
        if (!updateMethod) {
            global.logger.debugError(`No update method found for version ${newConfig.version} -> ${newConfig.version + 1}`, "CONFIG");
            break;
        }
        newConfig = await updateMethod(newConfig);
        global.logger.debug(`CFG: ${newConfig.version} -> ${newConfig.version + 1}`, "CONFIG");
        newConfig.version++;
    }

    global.logger.log(`Updated config from version ${oldVersion} to ${newConfig.version}`, "CONFIG");

    newConfig.version = maxVersion;
    const configPath = join(global.dirName, "..", "config.jsonc");
    writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
    return { updated: true };
}

type OldConfig = { [key: string | number]: any };

const updateMethods: {
    [key: string]: (config: OldConfig) => Promise<Partial<AppInterface["config"]>>;
} = {
    "1 -> 2": async (config: OldConfig) => {        

        //* Do changes to config here
        // Example: config.new.key = config.old.key; delete config.old.key;

        config = renameObjKey({oldObj: config, oldKey: "showErrors", newKey: "showDetailedErrors"})
        

        return config
    }
}


const renameObjKey = ({oldObj, oldKey, newKey}) => {
  const keys = Object.keys(oldObj);
  const newObj = keys.reduce((acc, val)=>{
    if(val === oldKey){
        acc[newKey] = oldObj[oldKey];
    }
    else {
        acc[val] = oldObj[val];
    }
    return acc;
  }, {});

  return newObj;
};