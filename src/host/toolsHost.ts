// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { encodeMessageForChannel, TelemetryData, WebSocketEvent, WebviewEvent } from "../common/webviewEvents";
import ToolsResourceLoader from "./toolsResourceLoader";
import ToolsWebSocket from "./toolsWebSocket";

export default class ToolsHost {
    private resourceLoader: Readonly<ToolsResourceLoader> | undefined;
    private getStateNextId: number = 0;
    private getStateCallbacks: Map<number, (preferences: object) => void> = new Map();
    private getStringsCallback: (message: any) => boolean = () => { return false; };

    public setResourceLoader(resourceLoader: Readonly<ToolsResourceLoader>) {
        this.resourceLoader = resourceLoader;
    }

    public isHostedMode() {
        // DevTools will always be inside a webview
        return true;
    }
    

    public getPreferences(callback: (preferences: any) => void) {
        // Load the preference via the extension workspaceState
        const id = this.getStateNextId++;
        this.getStateCallbacks.set(id, callback);
        encodeMessageForChannel((msg) => window.parent.postMessage(msg, "*"), "getState", { id });
    }

    public setPreference(name: string, value: string) {
        // Save the preference via the extension workspaceState
        encodeMessageForChannel((msg) => window.parent.postMessage(msg, "*"), "setState", { name, value });
    }

    public setGetStringsCallback(callback: (message: any) => boolean) {
        this.getStringsCallback = callback;
    }

    public recordEnumeratedHistogram(actionName: string, actionCode: number, bucketSize: number) {
        // Inform the extension of the DevTools telemetry event
        this.sendTelemetry({
            data: actionCode,
            event: "enumerated",
            name: actionName,
        });
    }

    public recordPerformanceHistogram(histogramName: string, duration: number) {
        // Inform the extension of the DevTools telemetry event
        this.sendTelemetry({
            data: duration,
            event: "performance",
            name: histogramName,
        });
    }

    public reportError(
        type: string,
        message: string,
        stack: string,
        filename: string,
        sourceUrl: string,
        lineno: number,
        colno: number) {
        // Package up the error info to send to the extension
        const data = { message, stack, filename, sourceUrl, lineno, colno };

        // Inform the extension of the DevTools telemetry event
        this.sendTelemetry({
            data,
            event: "error",
            name: type,
        });
    }

    public onMessageFromChannel(e: WebviewEvent, args: string): boolean {
        switch (e) {
            case "getState": {
                const { id, preferences } = JSON.parse(args);
                this.fireGetStateCallback(id, preferences);
                break;
            }

            case "getUrl": {
                const { id, content } = JSON.parse(args);
                this.fireGetUrlCallback(id, content);
                break;
            }

            case "websocket": {
                const { event, message } = JSON.parse(args);
                this.fireWebSocketCallback(event, message);
                break;
            }
            case "getStrings": {
                const { event, message } = JSON.parse(args);
                this.fireGetStringsCallback(event, message);
                break;
            }
        }
        return true;
    }

    private sendTelemetry(telemetry: TelemetryData) {
        // Forward the data to the extension
        encodeMessageForChannel((msg) => window.parent.postMessage(msg, "*"), "telemetry", telemetry);
    }

    private fireGetStateCallback(id: number, preferences: object) {
        if (this.getStateCallbacks.has(id)) {
            this.getStateCallbacks.get(id)!(preferences);
            this.getStateCallbacks.delete(id);
        }
    }

    private fireGetUrlCallback(id: number, content: string) {
        // Send response content to DevTools
        if (this.resourceLoader) {
            this.resourceLoader.onResolvedUrlFromChannel(id, content);
        }
    }

    private fireWebSocketCallback(e: WebSocketEvent, message: string) {
        if (this.getStringsCallback(message)){
            // String event is intercepted in here and handled already
            // do not propagate.
            return;
        }

        // Send response message to DevTools
        let instance = ToolsWebSocket.instance;
        if (instance)
            instance.onMessageFromChannel(e, message);
    }

    private fireGetStringsCallback(e: WebSocketEvent, message: string) {
        this.getStringsCallback(message);

        // do not propagate the event to the devtools window.
    }
}
