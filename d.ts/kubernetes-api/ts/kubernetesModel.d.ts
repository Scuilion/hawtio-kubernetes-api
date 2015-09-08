/// <reference path="kubernetesApiPlugin.d.ts" />
declare module KubernetesAPI {
    class KubernetesModelService {
        kubernetes: KubernetesState;
        apps: any[];
        services: any[];
        replicationcontrollers: any[];
        replicationControllers: Array<any>;
        pods: any[];
        hosts: any[];
        namespaces: Array<string>;
        routes: any[];
        templates: any[];
        redraw: boolean;
        resourceVersions: {};
        podsByHost: {};
        servicesByKey: {};
        replicationControllersByKey: {};
        podsByKey: {};
        appInfos: any[];
        appViews: any[];
        appFolders: any[];
        fetched: boolean;
        showRunButton: boolean;
        buildconfigs: any[];
        serviceApps: Array<any>;
        $keepPolling(): boolean;
        orRedraw(flag: any): void;
        getService(namespace: any, id: any): any;
        getReplicationController(namespace: any, id: any): any;
        getPod(namespace: any, id: any): any;
        podsForNamespace(namespace?: any): any[];
        currentNamespace(): any;
        protected updateIconUrlAndAppInfo(entity: any, nameField: string): void;
        maybeInit(): void;
        protected updateApps(): void;
        protected discoverPodConnections(entity: any): void;
    }
}
