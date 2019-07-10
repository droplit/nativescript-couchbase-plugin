import {
    BlobBase,
    Common,
    Query,
    QueryComparisonOperator,
    QueryLogicalOperator,
    QueryMeta,
    ReplicatorBase
} from './couchbase-plugin.common';
import * as utils from 'tns-core-modules/utils/utils';
import * as types from 'tns-core-modules/utils/types';
import * as fs from 'tns-core-modules/file-system';

export {
    Query,
    QueryMeta,
    QueryArrayOperator,
    QueryComparisonOperator,
    QueryLogicalOperator,
    QueryOrderItem,
    QueryWhereItem
} from './couchbase-plugin.common';

declare var com, co;

export class Couchbase extends Common {
    config: any;
    android: any;

    constructor(name: string) {
        super(name);
        this.config = new com.couchbase.lite.DatabaseConfiguration(
            utils.ad.getApplicationContext()
        );
        this.android = new com.couchbase.lite.Database(name, this.config);
    }

    inBatch(batch: () => void) {
        const runnable = new java.lang.Runnable({
            run: () => {
                batch();
            }
        });

        this.android.inBatch(runnable);
    }

    createDocument(data: Object, documentId?: string) {
        try {
            let doc;
            if (documentId) {
                doc = new com.couchbase.lite.MutableDocument(documentId);
            } else {
                doc = new com.couchbase.lite.MutableDocument();
            }
            const keys = Object.keys(data);
            for (let key of keys) {
                const item = data[key];
                this.serialize(item, doc, key);
            }
            this.android.save(doc);
            return doc.getId();
        } catch (e) {
            console.error(e.message);
            return null;
        }
    }

    setBlob(id: string, name: string, blob: any, mimeType: string = 'application/octet-stream') {
        try {
            const document = this.android.getDocument(id).toMutable();
            if (typeof blob === 'string') {
                if (blob.startsWith(`file`)) {
                    const nativeBlob = new com.couchbase.lite.Blob(mimeType, new java.net.URL(blob));
                    document.setBlob(name, nativeBlob);
                } else if (blob.startsWith(`/`)) {
                    const nativeBlob = new com.couchbase.lite.Blob(mimeType, new java.net.URL(`file://${blob}`));
                    document.setBlob(name, nativeBlob);
                } else if (blob.startsWith(`~`)) {
                    const path = fs.path.join(fs.knownFolders.currentApp().path, blob.replace('~', ''));
                    const nativeBlob = new com.couchbase.lite.Blob(mimeType, new java.net.URL(`file://${path}`));
                    document.setBlob(name, nativeBlob);
                } else if (blob.startsWith(`res`)) {
                    const ctx = utils.ad.getApplicationContext() as android.content.Context;
                    const is = ctx.getAssets().open(blob.replace('res://', ''));
                    const nativeBlob = new com.couchbase.lite.Blob(mimeType, is);
                    document.setBlob(name, nativeBlob);
                } else {
                    // TODO what else to check?
                }
                this.android.save(document);
            } else {
                // TODO what else to check ... maybe native objects ??
                const nativeBlob = new com.couchbase.lite.Blob(mimeType, blob);
                document.setBlob(name, nativeBlob);
                this.android.save(document);
            }
        } catch (e) {
            console.log(e);
        }
    }

    getBlob(id: string, name: string) {
        let document = this.android.getDocument(id) as com.couchbase.lite.Document;
        if (!document) return null;
        const blob = document.getBlob(name);
        if (!blob) return null;
        return new Blob(blob);
    }

    private deserialize(data: any) {
        if (
            typeof data === 'string' ||
            typeof data === 'number' ||
            typeof data === 'boolean' ||
            typeof data !== 'object'
        )
            return data;

        if (types.isNullOrUndefined(data)) {
            return data;
        }

        switch (data.getClass().getName()) {
            case 'java.lang.String':
                return String(data);
            case 'java.lang.Boolean':
                return String(data) === 'true';
            case 'java.lang.Integer':
            case 'java.lang.Long':
            case 'java.lang.Double':
            case 'java.lang.Short':
            case 'java.lang.Float':
                return Number(data);
            case 'com.couchbase.lite.Dictionary':
                const keys = data.getKeys();
                const length = keys.size();
                const object = {};
                for (let i = 0; i < length; i++) {
                    const key = keys.get(i);
                    const nativeItem = data.getValue(key);
                    object[key] = this.deserialize(nativeItem);
                }
                return object;
            case 'com.couchbase.lite.Array':
                const array = [];
                const size = data.count();
                for (let i = 0; i < size; i++) {
                    const nativeItem = data.getValue(i);
                    const item = this.deserialize(nativeItem);
                    array.push(item);
                }
                return array;
            default:
                return data;
        }
    }

    getDocument(documentId: string): any {
        try {
            const doc = this.android.getDocument(documentId);
            if (!doc) return null;
            const keys = doc.getKeys();
            const size = keys.size();
            let object = {};
            object['id'] = doc.getId();
            for (let i = 0; i < size; i++) {
                const key = keys.get(i);
                const nativeItem = doc.getValue(key);
                const newItem = {};
                newItem[key] = this.deserialize(nativeItem);
                object = Object.assign(object, newItem);
            }
            return object;
        } catch (e) {
            console.error(e.message);
            return null;
        }
    }

    private convertToJsDocument(doc: com.couchbase.lite.Document): Object {
        try {
            if (!doc) return null;
            const keys = doc.getKeys();
            const size = keys.size();
            let object = {};
            object['id'] = doc.getId();
            for (let i = 0; i < size; i++) {
                const key = keys.get(i);
                const nativeItem = doc.getValue(key);
                const newItem = {};
                newItem[key] = this.deserialize(nativeItem);
                object = Object.assign(object, newItem);
            }
            return object;
        } catch (e) {
            console.error(e.message);
            return null;
        }
    }

    static stringArrayToJavaStringList(arr: string[]): java.util.List<string> {
        let strList = new java.util.ArrayList<string>();
        arr.forEach(value => strList.add(value));
        return strList;
    }

    private fromISO8601UTC(date: string) {
        const dateFormat = new java.text.SimpleDateFormat(
            'yyyy-MM-dd\'T\'HH:mm:ss.SSS'
        );
        const tz = java.util.TimeZone.getTimeZone('UTC');
        dateFormat.setTimeZone(tz);
        return dateFormat.parse(date);
    }

    private toISO8601UTC(date: Date) {
        const dateFormat = new java.text.SimpleDateFormat(
            'yyyy-MM-dd\'T\'HH:mm:ss.SSS'
        );
        const tz = java.util.TimeZone.getTimeZone('UTC');
        dateFormat.setTimeZone(tz);

        return dateFormat.format(date);
    }

    updateDocument(documentId: string, data: any) {
        try {
            const origin = this.android.getDocument(
                documentId
            ) as com.couchbase.lite.Document;
            if (origin) {
                const doc = origin.toMutable();
                const keys = Object.keys(data);
                for (let key of keys) {
                    const item = data[key];
                    this.serialize(item, doc, key);
                }
                this.android.save(doc);
            }
        } catch (e) {
            console.error(e.message);
        }
    }

    private serializeObject(item, object, key) {
        if (item === null) {
            return;
        }

        switch (typeof item) {
            case 'object':
                if (item instanceof Date) {
                    object.setDate(key, this.fromISO8601UTC(item.toISOString()));
                    return;
                }

                if (Array.isArray(item)) {
                    const array = new com.couchbase.lite.MutableArray();
                    item.forEach(data => {
                        this.serializeArray(data, array);
                    });
                    object.setArray(key, array);
                    return;
                }

                const nativeObject = new com.couchbase.lite.MutableDictionary();
                Object.keys(item).forEach(itemKey => {
                    const obj = item[itemKey];
                    this.serializeObject(obj, nativeObject, itemKey);
                });
                object.setDictionary(key, nativeObject);
                break;
            case 'number':
                if (this.numberIs64Bit(item)) {
                    if (this.numberHasDecimals(item)) {
                        object.setDouble(key, item);
                    } else {
                        object.setLong(key, item);
                    }
                } else {
                    if (this.numberHasDecimals(item)) {
                        object.setFloat(key, item);
                    } else {
                        object.setInt(key, item);
                    }
                }
                break;
            case 'boolean':
                object.setBoolean(key, item);
                break;
            default:
                object.setValue(key, item);
        }
    }

    private serializeArray(item, array: any) {
        if (item === null) {
            return;
        }

        switch (typeof item) {
            case 'object':
                if (item instanceof Date) {
                    array.addDate(this.fromISO8601UTC(item.toISOString()));
                    return;
                }

                if (Array.isArray(item)) {
                    const nativeArray = new com.couchbase.lite.MutableArray();
                    item.forEach(data => {
                        this.serializeArray(data, nativeArray);
                    });
                    array.addArray(nativeArray);
                    return;
                }

                const object = new com.couchbase.lite.MutableDictionary();
                Object.keys(item).forEach(itemKey => {
                    const obj = item[itemKey];
                    this.serializeObject(obj, object, itemKey);
                });
                array.addDictionary(object);
                break;
            case 'number':
                if (this.numberIs64Bit(item)) {
                    if (this.numberHasDecimals(item)) {
                        array.addDouble(item);
                    } else {
                        array.addLong(item);
                    }
                } else {
                    if (this.numberHasDecimals(item)) {
                        array.addFloat(item);
                    } else {
                        array.addInt(item);
                    }
                }
                break;
            case 'boolean':
                array.addBoolean(item);
                break;
            default:
                array.addValue(item);
        }
    }

    private serialize(item, doc: any, key) {
        if (item === null) {
            return;
        }

        switch (typeof item) {
            case 'object':
                if (item instanceof Date) {
                    doc.setDate(key, this.fromISO8601UTC(item.toISOString()));
                    return;
                }

                if (Array.isArray(item)) {
                    const array = new com.couchbase.lite.MutableArray();
                    item.forEach(data => {
                        this.serializeArray(data, array);
                    });
                    doc.setArray(key, array);
                    return;
                }

                const object = new com.couchbase.lite.MutableDictionary();
                Object.keys(item).forEach(itemKey => {
                    const obj = item[itemKey];
                    this.serializeObject(obj, object, itemKey);
                });
                doc.setDictionary(key, object);
                break;
            case 'number':
                if (this.numberIs64Bit(item)) {
                    if (this.numberHasDecimals(item)) {
                        doc.setDouble(key, item);
                    } else {
                        doc.setLong(key, item);
                    }
                } else {
                    if (this.numberHasDecimals(item)) {
                        doc.setFloat(key, item);
                    } else {
                        doc.setInt(key, item);
                    }
                }
                break;
            case 'boolean':
                doc.setBoolean(key, item);
                break;
            default:
                doc.setValue(key, item);
        }
    }

    numberHasDecimals(item: number) {
        return !(item % 1 === 0);
    }

    numberIs64Bit(item: number) {
        return item < -Math.pow(2, 31) + 1 || item > Math.pow(2, 31) - 1;
    }

    deleteDocument(documentId: string) {
        try {
            const doc = this.android.getDocument(documentId);
            return this.android.delete(doc);
        } catch (e) {
            console.error(e.message);
            return false;
        }
    }

    destroyDatabase() {
        try {
            this.android.delete();
        } catch (e) {
            console.error(e.message);
        }
    }

    private serializeExpression(item) {
        if (item === null) {
            return null;
        }

        switch (typeof item) {
            case 'string':
                return com.couchbase.lite.Expression.string(item);
            case 'object':
                if (item instanceof Date) {
                    return com.couchbase.lite.Expression.date(this.fromISO8601UTC(item.toISOString()));
                }
                return com.couchbase.lite.Expression.value(item);

            case 'number':
                if (this.numberIs64Bit(item)) {
                    if (this.numberHasDecimals(item)) {
                        return com.couchbase.lite.Expression.doubleValue(item);
                    } else {
                        return com.couchbase.lite.Expression.longValue(item);
                    }
                } else {
                    if (this.numberHasDecimals(item)) {
                        return com.couchbase.lite.Expression.floatValue(item);
                    } else {
                        return com.couchbase.lite.Expression.intValue(item);
                    }
                }
            case 'boolean':
                return com.couchbase.lite.Expression.booleanValue(item);
            default:
                return com.couchbase.lite.Expression.value(item);
        }
    }

    private setComparision(item) {
        let nativeQuery;
        switch (item.comparison as QueryComparisonOperator) {
            case 'equalTo':
                nativeQuery = com.couchbase.lite.Expression.property(
                    item.property
                ).equalTo(this.serializeExpression(item.value));
                break;
            case 'add':
                nativeQuery = com.couchbase.lite.Expression.property(item.property).add(
                    this.serializeExpression(item.value)
                );
                break;
            case 'between':
                if (Array.isArray(item.value) && item.value.length === 2) {
                    nativeQuery = com.couchbase.lite.Expression.property(
                        item.property
                    ).between(
                        com.couchbase.lite.Expression.value(this.serializeExpression(item.value[0])),
                        com.couchbase.lite.Expression.value(this.serializeExpression(item.value[1]))
                    );
                }
                break;
            case 'collate':
                nativeQuery = com.couchbase.lite.Expression.property(
                    item.property
                ).collate(this.serializeExpression(item.value));
                break;
            case 'divide':
                nativeQuery = com.couchbase.lite.Expression.property(
                    item.property
                ).divide(this.serializeExpression(item.value));
                break;
            case 'greaterThan':
                nativeQuery = com.couchbase.lite.Expression.property(
                    item.property
                ).greaterThan(this.serializeExpression(item.value));
                break;
            case 'greaterThanOrEqualTo':
                nativeQuery = com.couchbase.lite.Expression.property(
                    item.property
                ).greaterThanOrEqualTo(this.serializeExpression(item.value));
                break;
            case 'in':
                const inArray = [];
                if (Array.isArray(item.value)) {
                    for (let exp of item.value) {
                        inArray.push(this.serializeExpression(exp));
                    }
                } else {
                    inArray.push(this.serializeExpression(item.value));
                }
                nativeQuery = com.couchbase.lite.Expression.property(item.property).in(
                    inArray
                );
                break;
            case 'is':
                nativeQuery = com.couchbase.lite.Expression.property(item.property).is(
                    this.serializeExpression(item.value)
                );
                break;
            case 'isNot':
                nativeQuery = com.couchbase.lite.Expression.property(
                    item.property
                ).isNot(this.serializeExpression(item.value));
                break;
            case 'isNullOrMissing':
                nativeQuery = com.couchbase.lite.Expression.property(
                    item.property
                ).isNullOrMissing();
                break;
            case 'lessThan':
                nativeQuery = com.couchbase.lite.Expression.property(
                    item.property
                ).lessThan(this.serializeExpression(item.value));
                break;
            case 'lessThanOrEqualTo':
                nativeQuery = com.couchbase.lite.Expression.property(
                    item.property
                ).lessThanOrEqualTo(this.serializeExpression(item.value));
                break;
            case 'like':
                nativeQuery = com.couchbase.lite.Expression.property(
                    item.property
                ).like(this.serializeExpression(item.value));
                break;
            case 'modulo':
                nativeQuery = com.couchbase.lite.Expression.property(
                    item.property
                ).modulo(this.serializeExpression(item.value));
                break;
            case 'multiply':
                nativeQuery = com.couchbase.lite.Expression.property(
                    item.property
                ).multiply(this.serializeExpression(item.value));
                break;

            case 'notEqualTo':
                nativeQuery = com.couchbase.lite.Expression.property(
                    item.property
                ).notEqualTo(this.serializeExpression(item.value));
                break;

            case 'notNullOrMissing':
                nativeQuery = com.couchbase.lite.Expression.property(
                    item.property
                ).notNullOrMissing();
                break;
            case 'regex':
                nativeQuery = com.couchbase.lite.Expression.property(
                    item.property
                ).regex(this.serializeExpression(item.value));
                break;
        }
        return nativeQuery;
    }

    query(query: Query = { select: [QueryMeta.ALL, QueryMeta.ID] }) {
        const items = [];
        let select = [];
        if (!query.select || query.select.length === 0) {
            select.push(com.couchbase.lite.SelectResult.all());
            select.push(
                com.couchbase.lite.SelectResult.expression(com.couchbase.lite.Meta.id)
            );
        } else {
            query.select.forEach(item => {
                if (item === QueryMeta.ID) {
                    select.push(
                        com.couchbase.lite.SelectResult.expression(
                            com.couchbase.lite.Meta.id
                        )
                    );
                } else if (item === QueryMeta.ALL) {
                    select.push(com.couchbase.lite.SelectResult.all());
                } else {
                    select.push(com.couchbase.lite.SelectResult.property(item));
                }
            });
        }
        let queryBuilder: any = com.couchbase.lite.QueryBuilder.select(select);
        if (query.from) {
            const db = new Couchbase(query.from);
            queryBuilder = queryBuilder.from(
                com.couchbase.lite.DataSource.database(db.android)
            );
        } else {
            queryBuilder = queryBuilder.from(
                com.couchbase.lite.DataSource.database(this.android)
            );
        }

        let nativeQuery = null;
        if (query.where) {
            for (let item of query.where) {
                if (item.logical === QueryLogicalOperator.AND) {
                    if (!nativeQuery) break;
                    nativeQuery = nativeQuery.and(this.setComparision(item));
                } else if (item.logical === QueryLogicalOperator.OR) {
                    if (!nativeQuery) break;
                    nativeQuery = nativeQuery.or(this.setComparision(item));
                } else {
                    nativeQuery = this.setComparision(item);
                }
            }
            if (nativeQuery) {
                queryBuilder = queryBuilder.where(nativeQuery);
            }
        }
        if (query.groupBy) {
            const groupBy = [];
            for (let prop of query.groupBy) {
                groupBy.push(com.couchbase.lite.Expression.property(prop));
            }
            if (groupBy.length > 0) {
                queryBuilder = queryBuilder.groupBy(groupBy);
            }
        }
        if (query.order) {
            const orderBy = [];
            for (let item of query.order) {
                if (item.direction === 'desc') {
                    orderBy.push(
                        com.couchbase.lite.Ordering.property(item.property).descending()
                    );
                } else {
                    orderBy.push(
                        com.couchbase.lite.Ordering.property(item.property).ascending()
                    );
                }
            }
            if (orderBy.length > 0) {
                queryBuilder = queryBuilder.orderBy(orderBy);
            }
        }

        if (query.limit && typeof query.limit === 'number') {
            if (query.offset && typeof query.offset === 'number') {
                queryBuilder = queryBuilder.limit(
                    com.couchbase.lite.Expression.intValue(query.limit),
                    com.couchbase.lite.Expression.intValue(query.offset)
                );
            } else {
                queryBuilder = queryBuilder.limit(
                    com.couchbase.lite.Expression.intValue(query.limit)
                );
            }
        }

        const result = queryBuilder.execute().allResults();
        const size = result.size();
        for (let i = 0; i < size; i++) {
            const item = result.get(i);
            const keys = item.getKeys();
            const keysSize = keys.size();
            const obj = {};
            for (let keyId = 0; keyId < keysSize; keyId++) {
                const key = keys.get(keyId);
                const nativeItem = item.getValue(key);
                if (typeof nativeItem === 'string') {
                    obj[key] = nativeItem;
                } else if (
                    nativeItem &&
                    nativeItem.getClass() &&
                    nativeItem.getClass().getName() === 'com.couchbase.lite.Dictionary'
                ) {
                    const cblKeys = nativeItem.getKeys();
                    const cblKeysSize = cblKeys.size();
                    for (let cblKeysId = 0; cblKeysId < cblKeysSize; cblKeysId++) {
                        const cblKey = cblKeys.get(cblKeysId);
                        obj[cblKey] = this.deserialize(nativeItem.getValue(cblKey));
                    }
                }
            }
            items.push(obj);
        }

        return items;
    }

    createReplication(remoteUrl: string, direction: 'push' | 'pull' | 'both', channels?: string[], pushFilter?: (document: any, flags: any) => boolean, pullFilter?: (document: any, flags: any) => boolean) {
        const uri = new com.couchbase.lite.URLEndpoint(new java.net.URI(remoteUrl));
        const repConfig: com.couchbase.lite.ReplicatorConfiguration = new com.couchbase.lite.ReplicatorConfiguration(
            this.android,
            uri
        );
        if (direction === 'pull') {
            repConfig.setReplicatorType(
                com.couchbase.lite.ReplicatorConfiguration.ReplicatorType.PULL
            );
        } else if (direction === 'push') {
            repConfig.setReplicatorType(
                com.couchbase.lite.ReplicatorConfiguration.ReplicatorType.PUSH
            );
        } else {
            repConfig.setReplicatorType(
                com.couchbase.lite.ReplicatorConfiguration.ReplicatorType.PUSH_AND_PULL
            );
        }
        if (pushFilter) {
            repConfig.setPushFilter(new com.couchbase.lite.ReplicationFilter({
                filtered: (document, flags): boolean => {
                    let js_document = this.convertToJsDocument(document);
                    let js_flags = flags.toArray();
                    return pushFilter(js_document, js_flags);
                }
            }));
        }
        if (pullFilter) {
            repConfig.setPullFilter(new com.couchbase.lite.ReplicationFilter({
                filtered: (document, flags): boolean => {
                    let js_document = this.convertToJsDocument(document);
                    let js_flags = flags.toArray();
                    return pullFilter(js_document, js_flags);
                }
            }));
        }
        if (channels && channels.length > 0) {
            repConfig.setChannels(Couchbase.stringArrayToJavaStringList(channels));
        }

        const replicator = new com.couchbase.lite.Replicator(repConfig);

        return new Replicator(replicator);
    }

    createPullReplication(
        remoteUrl: string
    ) {
        return this.createReplication(remoteUrl, 'pull');
    }

    createPushReplication(
        remoteUrl: string
    ) {
        return this.createReplication(remoteUrl, 'push');
    }

    addDatabaseChangeListener(callback: any) {
        const listener = co.fitcom.fancycouchbase.TNSDatabaseChangeListener.extend({
            onChange(changes: any): void {
                if (callback && typeof callback === 'function') {
                    const ids = [];
                    const documentIds = changes.getDocumentIDs();
                    const size = documentIds.size();
                    for (let i = 0; i < size; i++) {
                        const item = documentIds.get(i);
                        ids.push(item);
                    }
                    callback(ids);
                }
            }
        });
        this.android.addChangeListener(new listener());
    }

    createIndex(name: string, properties: string[]) {
        const valueIndexItems = properties.map(property => com.couchbase.ValueIndexItem.property(property));

        this.android.createIndex(name, com.couchbase.IndexBuilder.valueIndex(...valueIndexItems));
    }

    getIndexes() {
        const indexes = this.android.getIndexes();
        const size = indexes.size();
        const js_indexes = [];

        for (let i = 0; i < size; i++) {
            js_indexes.push(indexes.get(i));
        }

        return js_indexes;
    }

    deleteIndex(name: string) {
        this.android.deleteIndex(name);
    }
}

export class Replicator extends ReplicatorBase {
    constructor(replicator: any) {
        super(replicator);
    }

    private getReplicator(): com.couchbase.lite.Replicator {
        return this.replicator;
    }

    start() {
        this.replicator.start();
    }

    stop() {
        this.replicator.stop();
    }

    isRunning() {
        return (
            this.replicator.getStatus().getActivityLevel() ===
            com.couchbase.lite.AbstractReplicator.ActivityLevel.BUSY
        );
    }

    getChannels() {
        const channels = this.replicator.getConfig().getChannels();
        const size = channels.size();
        const js_channels = [];

        for (let i = 0; i < size; i++) {
            js_channels.push(channels.get(i));
        }

        return js_channels;
    }

    setContinuous(isContinuous: boolean) {
        const newConfig = new com.couchbase.lite.ReplicatorConfiguration(this.replicator.getConfig());
        newConfig.setContinuous(isContinuous);
        this.replicator = new com.couchbase.lite.Replicator(newConfig);
    }

    setSessionId(sessionId: string) {
        const newConfig = new com.couchbase.lite.ReplicatorConfiguration(this.replicator.getConfig());
        newConfig.setAuthenticator(
            new com.couchbase.lite.SessionAuthenticator(sessionId)
        );
        this.replicator = new com.couchbase.lite.Replicator(newConfig);
    }

    setSessionIdAndCookieName(sessionId: string, cookieName: string) {
        const newConfig = new com.couchbase.lite.ReplicatorConfiguration(this.replicator.getConfig());
        newConfig.setAuthenticator(
            new com.couchbase.lite.SessionAuthenticator(sessionId, cookieName)
        );
        this.replicator = new com.couchbase.lite.Replicator(newConfig);
    }

    setUserNameAndPassword(username: string, password: string) {
        const newConfig = new com.couchbase.lite.ReplicatorConfiguration(this.replicator.getConfig());
        newConfig.setAuthenticator(
            new com.couchbase.lite.BasicAuthenticator(username, password)
        );
        this.replicator = new com.couchbase.lite.Replicator(newConfig);
    }

    setChannels(channels: string[]) {
        const newConfig = new com.couchbase.lite.ReplicatorConfiguration(this.replicator.getConfig());
        newConfig.setChannels(Couchbase.stringArrayToJavaStringList(channels));
        this.replicator = new com.couchbase.lite.Replicator(newConfig);
    }

    addDocumentReplicationListener(listener: (documents: { documentId: string, error: any }[], isPush: boolean) => void) {
        this.getReplicator().addDocumentReplicationListener(new com.couchbase.lite.DocumentReplicationListener({
            replication: (replication: com.couchbase.lite.DocumentReplication) => {
                let isPush = replication.isPush();
                let docs: { documentId: string, error: any }[] = [];
                (<com.couchbase.lite.ReplicatedDocument[]>replication.getDocuments().toArray()).forEach(element => {
                    docs.push({ documentId: element.getID(), error: element.getError().toString() });
                });
                listener(docs, isPush);
            }
        }));
    }
}

export class Blob extends BlobBase {
    constructor(blob: any) {
        super(blob);
    }

    get android() {
        return this.blob;
    }

    get content(): any {
        if (!this.android) return null;
        return this.android.getContent();
    }

    get contentStream(): any {
        if (!this.android) return null;
        this.android.length();
        return this.android.getContentStream();
    }

    get contentType(): string {
        if (!this.android) return null;
        return this.android.getContentType();
    }

    get length(): number {
        if (!this.android) return 0;
        return this.android.length();
    }

    get digest(): string {
        if (!this.android) return null;
        return this.android.digest();
    }

    get properties(): Map<string, any> {
        const map = new Map();
        if (!this.android) return map;
        const nativeMap = this.android.getProperties();
        const mapKeys = nativeMap.keySet();
        const mapKeysArray = mapKeys.toArray();
        const length = mapKeysArray.length;
        for (let i = 0; i < length; i++) {
            const key = mapKeysArray[i];
            const value = nativeMap.get(key);
            map.set(key, value);
        }
        return map;
    }

}
