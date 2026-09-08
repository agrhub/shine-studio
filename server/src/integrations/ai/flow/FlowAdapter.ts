import axios from 'axios';
import { getDatabaseProvider } from '@/database/index.js';
import { IAIAccount, AIModelType, FlowOmniVideoOptions, FlowOmniVideoResult } from '~/types.js';
import { captchaService } from './CaptchaService.js';
import { StorageFactory } from '@/services/storage/StorageFactory.js';
import { flowSyncService } from './FlowSyncService.js';
import { flowServiceClient } from './FlowServiceClient.js';
import { EntityNormalizer } from '@/utils/EntityNormalizer.js';
import { Logger } from '@/utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class FlowAdapter {
    private apiBaseUrl = 'https://aisandbox-pa.googleapis.com/v1';

    constructor() {}

    /**
     * Map common ratio strings to Google Flow enum values
     */
    private mapAspectRatio(type: AIModelType.IMAGE | AIModelType.VIDEO, ratio: string): string {
        const cleanRatio = ratio.trim().toLowerCase();

        if (type === AIModelType.IMAGE) {
            const imageMap: Record<string, string> = {
                '16:9': 'IMAGE_ASPECT_RATIO_LANDSCAPE',
                '9:16': 'IMAGE_ASPECT_RATIO_PORTRAIT',
                '1:1': 'IMAGE_ASPECT_RATIO_SQUARE',
                '4:3': 'IMAGE_ASPECT_RATIO_LANDSCAPE_FOUR_THREE',
                '3:4': 'IMAGE_ASPECT_RATIO_PORTRAIT_THREE_FOUR',
                'landscape': 'IMAGE_ASPECT_RATIO_LANDSCAPE',
                'portrait': 'IMAGE_ASPECT_RATIO_PORTRAIT',
                'square': 'IMAGE_ASPECT_RATIO_SQUARE'
            };
            return imageMap[cleanRatio] || ratio; // Fallback to original if already enum or unknown
        } else {
            const videoMap: Record<string, string> = {
                '16:9': 'VIDEO_ASPECT_RATIO_LANDSCAPE',
                '9:16': 'VIDEO_ASPECT_RATIO_PORTRAIT',
                'landscape': 'VIDEO_ASPECT_RATIO_LANDSCAPE',
                'portrait': 'VIDEO_ASPECT_RATIO_PORTRAIT'
            };
            return videoMap[cleanRatio] || ratio;
        }
    }

    /**
     * Upload an image to Google Flow to get a mediaId
     */
    public async uploadMedia(account: IAIAccount, buffer: Buffer, mimeType: string, projectId: string): Promise<string> {
        const url = `${this.apiBaseUrl}/flow/uploadImage`;
        const userAgent = account.last_fingerprint?.get('user_agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
        
        const headers = {
            'authorization': `Bearer ${account.access_token}`,
            'Content-Type': 'application/json',
            'User-Agent': userAgent,
            'x-browser-channel': 'stable',
            'Referer': 'https://labs.google/fx/tools/flow',
            'Origin': 'https://labs.google',
        };

        const sessionId = Math.random().toString().slice(2, 17);
        const ext = mimeType.split('/')[1] || 'png';
        const fileName = `upload_${Date.now()}.${ext}`;

        const payload = {
            clientContext: {
                projectId: projectId,
                sessionId: sessionId,
                tool: 'PINHOLE'
            },
            fileName: fileName,
            imageBytes: buffer.toString('base64'),
            isHidden: false,
            isUserUploaded: true,
            mimeType: mimeType || 'image/png'
        };

        try {
            Logger.info(`[FlowAdapter] Uploading media to Flow... (${buffer.length} bytes, mime: ${mimeType})`);
            const response = await axios.post(url, payload, { headers });
            
            // Logger.info(`[FlowAdapter] Media uploaded successfully. Response: ${JSON.stringify(response.data)}`);
            const mediaName = response.data.media?.name || response.data.name || response.data.mediaId;
            if (!mediaName) {
                Logger.info(`[FlowAdapter] No media name in response. Data: ${JSON.stringify(response.data)}`);
                throw new Error('No mediaId returned from upload');
            }
            
            const cleanMediaId = mediaName.includes('/media/') ? mediaName.split('/media/')[1] : mediaName;
            // Logger.info(`[FlowAdapter] Media uploaded successfully. MediaId: ${cleanMediaId}`);
            return cleanMediaId;
        } catch (error: any) {
            const msg = error.response?.data?.error?.message || error.message;
            Logger.error(`[FlowAdapter] uploadMedia failed: ${msg}`);
            throw new Error(`Flow Upload Failed: ${msg}`);
        }
    }

    /**
     * Resolve media input: if it's a URL or base64, upload it first.
     */
    private async resolveMediaInput(account: IAIAccount, input: any, projectId: string): Promise<string> {
        const resolveToVeoMedia = async (input: any) => {
            if (!input) return undefined;
            if (typeof input !== 'string') return input; // Already resolved or object

            try {
                let buffer: Buffer;
                let mimeType = 'image/png';

                if (input.startsWith('https://') || input.startsWith('http://')) {
                    const response = await axios.get(input, { responseType: 'arraybuffer' });
                    buffer = Buffer.from(response.data);
                    mimeType = String(response.headers['content-type'] || 'image/png');
                } else if (input.startsWith('data:')) {
                    const parts = input.split(',');
                    mimeType = parts[0].split(':')[1].split(';')[0];
                    buffer = Buffer.from(parts[1], 'base64');
                } else {
                    const fileRes = await StorageFactory.getFileBuffer(input);
                    buffer = fileRes.buffer;
                    if (fileRes.mimeType) {
                        mimeType = fileRes.mimeType;
                    } else if (input.endsWith('.jpg') || input.endsWith('.jpeg')) {
                        mimeType = 'image/jpeg';
                    } else if (input.endsWith('.webp')) {
                        mimeType = 'image/webp';
                    } else if (input.endsWith('.mp4')) {
                        mimeType = 'video/mp4';
                    }
                }

                return {
                    mediaBytes: buffer.toString('base64'),
                    mimeType
                };
            } catch (err: any) {
                Logger.warn(`[FlowAdapter] Failed to resolve reference media: ${err.message}`);
                return undefined;
            }
        };

        // Logger.info(`[FlowAdapter] Resolving media input: ${input}`);

        // If it's already a Flow mediaId string (projects/.../media/...)
        if (typeof input === 'string' && input.startsWith('projects/') && input.includes('/media/')) {
            return input.split('/media/')[1];
        }

        const data = await resolveToVeoMedia(input);
        if (data) {
            const buffer = Buffer.from(data.mediaBytes, 'base64');
            return await this.uploadMedia(account, buffer, data.mimeType, projectId);
        }

        return input;
    }

    /**
     * Resolve model settings based on generic model ID and config
     */
    private resolveModelSettings(type: AIModelType.IMAGE | AIModelType.VIDEO, modelId: string, config: any = {}) {
        const rawRatio = config.aspectRatio || (type === AIModelType.IMAGE ? 'IMAGE_ASPECT_RATIO_LANDSCAPE' : 'VIDEO_ASPECT_RATIO_LANDSCAPE');
        const ratio = this.mapAspectRatio(type, rawRatio);
        
        const isPortrait = ratio.includes('PORTRAIT') || 
                          rawRatio === '9:16' || 
                          rawRatio === '3:4' || 
                          modelId.includes('portrait');
        
        const imageCount = (config.imageInputs || config.referenceImages || []).length;

        if (type === AIModelType.IMAGE) {
            let imageModelName = 'IMAGEN_3_5';
            // gemini-2.5-flash-image is not working on Flow right now
            // move gemini-2.5 to gemini-3.1
            if (modelId.includes('gemini-2.5-flash')) imageModelName = "NARWHAL";//'GEM_PIX';
            else if (modelId.includes('gemini-3.0-pro') || modelId.includes('gemini-3-pro') || modelId.includes('gemini-3-pro-image')) imageModelName = 'GEM_PIX_2';
            else if (modelId.includes('imagen-4.0')) imageModelName = 'IMAGEN_3_5';
            else if (modelId.includes('gemini-3.1-flash') || modelId.includes('narwhal')) imageModelName = 'NARWHAL';

            let upsample: string | null = null;
            if (modelId.includes('-2k')) upsample = 'UPSAMPLE_IMAGE_RESOLUTION_2K';
            else if (modelId.includes('-4k')) upsample = 'UPSAMPLE_IMAGE_RESOLUTION_4K';

            return { imageModelName, aspectRatio: ratio, upsample } as any;
        } else {
            // Video mapping
            let videoType: 't2v' | 'i2v' | 'r2v' | 'extend' | 'upsample' = config.model || 't2v';
            
            // Collect all potential images
            const images = config.imageInputs || config.referenceImages || [];
            const hasStart = (config.imageStart || config.image);
            const hasStartEnd = (hasStart && config.imageEnd);
            const hasCharacters = !!(config.characterImages && config.characterImages.length > 0);

            let prefix = 'veo_3_1';
            if(modelId.includes('veo-3.0')){
                prefix = "veo_3_0";
            }
            else if(modelId.includes('veo-3.1')){
                prefix = "veo_3_1";
            }
            else if(modelId.includes('veo-2.0')){
                prefix = "veo_2_0";
            }
            else if(modelId.includes('veo-2.1')){
                prefix = "veo_2_1";
            }

            if (config.mode === 'extend' || config.videoType === 'extend' || modelId.includes('extend')) {
                videoType = 'extend';
            } else if (config.mode === 'upsample' || config.videoType === 'upsample' || modelId.includes('upsample') || modelId.includes('upsampler')) {
                videoType = 'upsample';
            } else if (hasStartEnd || (hasStart && !hasCharacters)) {
                videoType = 'i2v';
            } else if (hasCharacters || (images.length > 0)) {
                videoType = 'r2v';
            }

            let videoModelKey = `${prefix}_t2v_fast_landscape`;
            if (videoType === 'extend') {
                videoModelKey = isPortrait ? `${prefix}_extend_portrait` : `${prefix}_extend`;
            } else if (videoType === 'upsample') {
                const resolution = config.resolution || 'VIDEO_RESOLUTION_4K';
                videoModelKey = resolution === 'VIDEO_RESOLUTION_1080P' ? `${prefix}_upsampler_1080p` : `${prefix}_upsampler_4k`;
            } else if (prefix === 'veo_2_0') {
                if (videoType === 't2v') {
                    videoModelKey = isPortrait ? `${prefix}_t2v_portrait` : `${prefix}_t2v_landscape`;
                } else if (videoType === 'i2v') {
                    videoModelKey = isPortrait ? `${prefix}_i2v_portrait` : `${prefix}_i2v_landscape`;
                }
            } else if (prefix === 'veo_2_1') {
                if (videoType === 't2v') {
                    videoModelKey = isPortrait ? `${prefix}_fast_d_15_t2v_portrait` : `${prefix}_fast_d_15_t2v_landscape`;
                } else if (videoType === 'i2v') {
                    videoModelKey = isPortrait ? `${prefix}_fast_d_15_i2v_portrait` : `${prefix}_fast_d_15_i2v_landscape`;
                }
            } else {//3.0/3.1
                if (videoType === 't2v') {
                    videoModelKey = isPortrait ? `${prefix}_t2v_fast_portrait` : `${prefix}_t2v_fast`;
                } else if (videoType === 'i2v') {
                    videoModelKey = isPortrait ? `${prefix}_i2v_s_fast_portrait_fl` : `${prefix}_i2v_s_fast_fl`;
                } else if (videoType === 'r2v') {
                    videoModelKey = isPortrait ? `${prefix}_r2v_fast_portrait` : `${prefix}_r2v_fast_landscape`;
                }
            }

            return { videoModelKey, aspectRatio: ratio, videoType, resolution: config.resolution || 'VIDEO_RESOLUTION_1080P' };
        }
    }

    private getSessionId(){
        return ';' + new Date().getTime();
    }

    private async syncFlowAccount(account: IAIAccount, config: any = {}){
        try {
            const db = await getDatabaseProvider();
            const freshAccounts = await db.getFlowAccounts();
            const freshAccount = freshAccounts.find(a => a.email === account.email || a.id === account.id);
            if (freshAccount && freshAccount.access_token) {
                account.access_token = freshAccount.access_token;
                account.project_id = freshAccount.project_id;
            }

            if (!account.access_token) {
                await flowSyncService.refreshAccountTokens(account);
            }

            let projectId = account.project_id || config.projectId || config.project_id;
            if (!projectId) {
                Logger.info(`[FlowAdapter] Project ID missing for ${account.email}, attempting to resolve...`);
                projectId = await flowSyncService.ensureProject(account);
            }
            account.project_id = projectId;
        } catch (refreshErr: any) {
            Logger.warn(`[FlowAdapter] Token refresh failed, using existing token: ${refreshErr.message}`);
        }
    }

    private getHeaders(account: IAIAccount, customReferer?: string){
        const userAgent = account.last_fingerprint?.get('user_agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
        const headers: any = {
            'authorization': `Bearer ${account.access_token}`,
            'Content-Type': 'application/json',
            'User-Agent': userAgent,
            'x-browser-channel': 'stable',
            'Referer': customReferer || 'https://labs.google/fx/tools/flow',
            'Origin': 'https://labs.google',
        };

        if (account.last_fingerprint) {
            const fp = account.last_fingerprint;
            if (fp.get('sec_ch_ua')) headers['sec-ch-ua'] = fp.get('sec_ch_ua');
            if (fp.get('sec_ch_ua_mobile')) headers['sec-ch-ua-mobile'] = fp.get('sec_ch_ua_mobile');
            if (fp.get('sec_ch_ua_platform')) headers['sec-ch-ua-platform'] = fp.get('sec_ch_ua_platform');
            if (fp.get('accept_language')) headers['Accept-Language'] = fp.get('accept_language');
        }

        return headers;
    }

    private async createFlowProject(account: IAIAccount, projectId: string){
        Logger.warn(`[FlowAdapter] Project ${projectId} not found (404). Creating fresh project on Google Labs...`);
        try {
            const newProjectId = await flowSyncService.createNewProject(account);
            account.project_id = newProjectId;
            return newProjectId;
        } catch (pErr: any) {
            throw new Error(`Flow Video Generation Failed: ${pErr.message}`);
        }
        return null;
    }

    /**
     * Generate image using Google Flow
     */
    public async generateImage(account: IAIAccount, prompt: string, modelName: string, config: any = {}) {
        const refImages = [
            ...(config.imageInputs || []),
            ...(config.referenceImages || []),
            config.image
        ].filter(Boolean);

        // 1. Fast-path: Check if standalone Flow Worker is online and has active workers
        const isWorkerOnline = await flowServiceClient.hasActiveWorkers();
        if (isWorkerOnline) {
            Logger.info(`[FlowAdapter] Routing image generation through standalone Flow Worker (References: ${refImages.length})...`);
            const ratio = (config.ratio || config.aspectRatio || '9:16') as '9:16' | '16:9' | '1:1';
            const workerResult = await flowServiceClient.generateImage({
                prompt,
                aspectRatio: ratio,
                model: modelName,
                images: refImages,
                referenceImages: refImages,
                namedReferences: config.namedReferences,
                accountId: config.accountId || ((account?.id === 'flow-worker' || account?.email === 'flow-worker-fleet') ? undefined : (account?.email || account?.id)),
            });
            if (workerResult.mediaUrl) {
                return {
                    url: workerResult.mediaUrl,
                    mediaId: workerResult.jobId,
                    prompt,
                };
            }
        }

        await this.syncFlowAccount(account, config);
        let projectId = account.project_id;
        if (!projectId) {
            throw new Error('Flow Project ID not found');
        }

        // 1. Resolve inputs (upload if necessary)
        const imageInputs: any[] = [];
        if (config.imageInputs && config.imageInputs.length > 0) {
            for (const img of config.imageInputs) {
                const mediaId = await this.resolveMediaInput(account, img, projectId);
                imageInputs.push({
                    name: mediaId,
                    imageInputType: 'IMAGE_INPUT_TYPE_REFERENCE'
                });
            }
        }

        // 2. Resolve model settings
        const settings: any = this.resolveModelSettings(AIModelType.IMAGE, modelName, { ...config, imageInputs });
        Logger.info(`[FlowAdapter] Resolved model settings: ${JSON.stringify(settings)}`);

        let retry = 5;
        while(retry > 0){
            try{
                // 3. Get reCAPTCHA token
                const recaptchaToken = await captchaService.solve({
                    projectId: projectId,
                    action: 'IMAGE_GENERATION',
                    tokenId: (account as any).id || (account as any)._id
                });

                if (!recaptchaToken) {
                    throw new Error('Failed to obtain reCAPTCHA token for Flow generation');
                }

                // 4. Prepare request
                const sessionId = this.getSessionId();//Math.random().toString().slice(2, 17);
                const url = `${this.apiBaseUrl}/projects/${projectId}/flowMedia:batchGenerateImages`;
                const clientContext = {
                    recaptchaContext: {
                        token: recaptchaToken,
                        applicationType: "RECAPTCHA_APPLICATION_TYPE_WEB"
                    },
                    sessionId: sessionId,
                    projectId: projectId,
                    tool: 'PINHOLE'
                };

                const requestData: any = {
                    clientContext: clientContext,
                    seed: Math.floor(Math.random() * 99999) + 1,
                    imageModelName: settings.imageModelName,
                    imageAspectRatio: settings.aspectRatio,
                    structuredPrompt: {
                        parts: [{
                            text: prompt
                        }]
                    },
                };

                if (imageInputs.length > 0) {
                    requestData.imageInputs = imageInputs;
                }

                const payload: any = {
                    clientContext: clientContext,
                    mediaGenerationContext: {
                        batchId: uuidv4()
                    },
                    useNewMedia: true,
                    requests: [requestData]
                };

                if (settings.upsample) {
                    payload.requests[0].upsampleImageResolution = settings.upsample;
                }

                const headers = this.getHeaders(account);
                Logger.info(`[FlowAdapter] [generateImage] targetURL: ${url}`);

                const response = await axios.post(url, payload, { headers });

                // Extract image using unified EntityNormalizer
                const extracted = EntityNormalizer.extractImageFromResponse(response.data);
                if (extracted) {
                    retry = 0;
                    return {
                        buffer: extracted.buffer || (extracted.url.startsWith('data:') ? Buffer.from(extracted.url.split(',')[1], 'base64') : undefined),
                        url: extracted.url,
                        mimeType: extracted.mimeType,
                    };
                }

                const mediaName = response.data.media?.[0]?.name || response.data.name;
                if (mediaName && mediaName.includes('operations/')) {
                    Logger.info(`[FlowAdapter] Image generation is async, polling operation: ${mediaName}`);
                    return await this.pollMedia(account, projectId, mediaName, AIModelType.IMAGE);
                }

                Logger.error(`[FlowAdapter] Response did not contain inline image bytes or operation: ${JSON.stringify(response.data).substring(0, 300)}...`);
                throw new Error('Flow API Error: No image returned from generation');
            }catch(error: any){
                const msg = error.response?.data?.error?.message || error.message;
                if (error.response?.status === 404 || msg?.includes('Requested entity was not found')) {
                    const newProjectId = await this.createFlowProject(account, projectId);
                    if(!newProjectId){
                        throw new Error(`Flow Image Generation Failed: Failed to create new project`);
                    }
                    projectId = newProjectId;
                    retry--;
                    continue;
                }
                if(msg != "reCAPTCHA evaluation failed"){
                    throw new Error(`Flow Image Generation Failed: ${msg}`);
                }
                Logger.info(`[FlowAdapter] reCAPTCHA evaluation failed. Retrying in 5s...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                retry--;
            }
        }
        return null;
    }

    /**
     * Generate video using Google Flow (Veo)
     */
    public async generateVideo(account: IAIAccount, prompt: string, modelName: string, config: any = {}) {
        const rawImages = [
            ...(config.imageInputs || []),
            ...(config.referenceImages || []),
            ...(config.characterImages || []),
            ...(config.characterReferences || []),
            config.imageStart,
            config.imageEnd,
            config.image
        ].filter(Boolean);

        // Fast-path: Check if standalone Flow Worker is online and has active workers
        const isWorkerOnline = await flowServiceClient.hasActiveWorkers();
        if (isWorkerOnline) {
            Logger.info(`[FlowAdapter] Routing video generation through standalone Flow Worker (References: ${rawImages.length})...`);
            const ratio = (config.ratio || config.aspectRatio || '9:16') as '9:16' | '16:9' | '1:1';
            const workerResult = await flowServiceClient.generateVideo({
                prompt,
                aspectRatio: ratio,
                duration: config.durationSeconds || 5,
                model: modelName,
                imageStart: config.imageStart || config.startFrame || config.start_frame_url || undefined,
                imageEnd: config.imageEnd || config.endFrame || config.end_frame_url || undefined,
                referenceImages: rawImages.slice(0, 3),
                characterReferences: config.characterReferences || config.characterImages,
                accountId: config.accountId || ((account?.id === 'flow-worker' || account?.email === 'flow-worker-fleet') ? undefined : (account?.email || account?.id)),
            });
            if (workerResult.mediaUrl) {
                return {
                    url: workerResult.mediaUrl,
                    mediaId: workerResult.jobId,
                    prompt,
                };
            }
        }

        // Dispatch to dedicated generateOmniVideo when model is omni or abra
        if (modelName && (modelName.toLowerCase().includes('omni') || modelName.toLowerCase().includes('abra'))) {
            const rawImages = [
                ...(config.imageInputs || []),
                ...(config.referenceImages || []),
                ...(config.characterImages || []),
                ...(config.characterReferences || []),
                config.imageStart,
                config.imageEnd,
                config.image
            ].filter(Boolean);

            return this.generateOmniVideo(account, prompt, {
                aspectRatio: config.aspectRatio,
                durationSeconds: config.durationSeconds > 10 ? 10 : config.durationSeconds,
                referenceImages: rawImages,
                userPaygateTier: config.userPaygateTier,
                resolution: config.resolution,
                async: config.async,
            });
        }

        await this.syncFlowAccount(account, config);
        let projectId = account.project_id;
        if (!projectId) {
            throw new Error('Flow Project ID not found');
        }

        // 1. Resolve inputs (upload if necessary)
        // Deduplicate and resolve

        // Deduplicate and resolve
        const uniqueImages = [...new Set(rawImages)];
        const resolvedMediaIds: string[] = [];
        for (const img of uniqueImages.slice(0, 3)) { // API Limit is 3
            resolvedMediaIds.push(await this.resolveMediaInput(account, img, projectId));
        }

        // Collect and resolve potential video references (for extend/upsample)
        const rawVideos = [
            config.videoInput,
            config.referenceVideo,
            config.video
        ].filter(v => !!v);

        const uniqueVideos = [...new Set(rawVideos)];
        const resolvedVideoIds: string[] = [];
        for (const vid of uniqueVideos) {
            resolvedVideoIds.push(await this.resolveMediaInput(account, vid, projectId));
        }

        // 2. Resolve model settings
        const settings: any = this.resolveModelSettings(AIModelType.VIDEO, modelName, { ...config, imageInputs: resolvedMediaIds });
        Logger.info(`[FlowAdapter] generateVideo settings: ${JSON.stringify(settings)}`);

        let retry = 5;
        while(retry > 0){
            try{
                // 3. Get reCAPTCHA token
                const recaptchaToken = await captchaService.solve({
                    projectId: projectId,
                    action: 'VIDEO_GENERATION',
                    tokenId: (account as any).id || (account as any)._id
                });

                if (!recaptchaToken) {
                    throw new Error('Failed to obtain reCAPTCHA token for Flow generation');
                }

                // 4. Prepare request
                const sessionId = this.getSessionId();//Math.random().toString().slice(2, 17);
                const sceneId = uuidv4();
                
                // Select URL based on video type and image count
                let url = `${this.apiBaseUrl}/video:batchAsyncGenerateVideoText`;
                if (settings.videoType === 'i2v') {
                    if (resolvedMediaIds.length === 1) {
                        url = `${this.apiBaseUrl}/video:batchAsyncGenerateVideoStartImage`;
                    } else {
                        url = `${this.apiBaseUrl}/video:batchAsyncGenerateVideoStartAndEndImage`;
                    }
                } else if (settings.videoType === 'r2v') {
                    url = `${this.apiBaseUrl}/video:batchAsyncGenerateVideoReferenceImages`;
                } else if (settings.videoType === 'extend') {
                    url = `${this.apiBaseUrl}/video:batchAsyncGenerateVideoExtendVideo`;
                } else if (settings.videoType === 'upsample') {
                    url = `${this.apiBaseUrl}/video:batchAsyncGenerateVideoUpsampleVideo`;
                }

                const clientContext = {
                    recaptchaContext: {
                        token: recaptchaToken,
                        applicationType: "RECAPTCHA_APPLICATION_TYPE_WEB"
                    },
                    sessionId: sessionId,
                    projectId: projectId,
                    tool: 'PINHOLE',
                    userPaygateTier: config.userPaygateTier || "PAYGATE_TIER_ZERO"
                };

                const requests: any = {
                    aspectRatio: settings.aspectRatio,
                    seed: Math.floor(Math.random() * 99999) + 1,
                    videoModelKey: settings.videoModelKey,
                    metadata: {
                        sceneId: sceneId
                    }
                };

                if (settings.videoType !== 'upsample') {
                    requests.textInput = {
                        structuredPrompt: {
                            parts: [{
                                text: prompt
                            }]
                        }
                    };
                }

                if (settings.videoType === 'i2v') {
                    requests.startImage = resolvedMediaIds[0] ? { mediaId: resolvedMediaIds[0] } : undefined;
                    requests.endImage = resolvedMediaIds[1] ? { mediaId: resolvedMediaIds[1] } : undefined;
                } else if (settings.videoType === 'r2v') {
                    if(resolvedMediaIds.length > 0){
                        requests.referenceImages = resolvedMediaIds.map(id => ({
                            mediaId: id,
                            imageUsageType: 'IMAGE_USAGE_TYPE_ASSET'
                        }));
                    }
                } else if (settings.videoType === 'extend') {
                    const videoMediaId = resolvedVideoIds[0];
                    if (!videoMediaId) {
                        throw new Error('Extend mode requires a source video reference (videoInput, referenceVideo, or video)');
                    }
                    requests.videoInput = {
                        mediaId: videoMediaId
                    };
                } else if (settings.videoType === 'upsample') {
                    const videoMediaId = resolvedVideoIds[0];
                    if (!videoMediaId) {
                        throw new Error('Upsample mode requires a source video reference (videoInput, referenceVideo, or video)');
                    }
                    requests.videoInput = {
                        mediaId: videoMediaId
                    };
                    requests.resolution = settings.resolution;
                }

                const payload: any = {
                    clientContext: clientContext,
                    requests: [requests],
                    useV2ModelConfig: true,
                    mediaGenerationContext: {
                        batchId: uuidv4(),
                        // audioFailurePreference: "ALLOW_SILENT_VIDEOS"
                    }
                };

                const headers = this.getHeaders(account);
                Logger.info(`[FlowAdapter] [generateVideo] targetURL: ${url}`);
                // Logger.info(`[FlowAdapter] [generateVideo] payload: ${JSON.stringify(payload, null, 2)}`);
                const response = await axios.post(url, payload, { headers });
                
                const mediaName = response.data.name || 
                                response.data.operation?.name || 
                                response.data.results?.[0]?.name ||
                                response.data.media?.[0]?.name;

                if (!mediaName) {
                    Logger.info(`[FlowAdapter] [generateVideo] No mediaName. Full response: ${JSON.stringify(response.data)}`);
                    throw new Error('Flow API Error: No operation name returned');
                }

                Logger.info(`[FlowAdapter] Generation submitted. Operation: ${mediaName}`);

                if (config.async === true) {
                    return { jobId: mediaName, status: 'pending' };
                }

                //ignore reCAPTCHA evaluation failed
                retry = 0;

                return await this.pollMedia(account, projectId, mediaName, AIModelType.VIDEO);
            }catch(error: any){
                const msg = error.response?.data?.error?.message || error.message;
                if (error.response?.status === 404 || msg?.includes('Requested entity was not found')) {
                    const newProjectId = await this.createFlowProject(account, projectId);
                    if(!newProjectId){
                        throw new Error(`Flow Image Generation Failed: Failed to create new project`);
                    }
                    projectId = newProjectId;
                    retry--;
                    continue;
                }
                if(msg.includes("Resource has been exhausted")){
                    await flowSyncService.refreshAccountTokens(account);
                }
                if(msg != "reCAPTCHA evaluation failed"){
                    throw new Error(`Flow Video Generation Failed: ${msg}`);
                }
                Logger.info(`[FlowAdapter] reCAPTCHA evaluation failed. Retrying in 5s...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                retry--;
            }
        }
        return null;
    }

    /**
     * Dedicated Omni Video Generation using Google Flow's abra_r2v model
     * Reference: tmp/flow2api/src/services/flow_client.py (line 2746 generate_omni_reference_video)
     */
    public async generateOmniVideo(
        account: IAIAccount,
        prompt: string,
        options: FlowOmniVideoOptions
    ): Promise<FlowOmniVideoResult | null> {
        await this.syncFlowAccount(account, options);
        let projectId = account.project_id;
        if (!projectId) {
            throw new Error('Flow Project ID not found');
        }

        // Resolve reference images
        const rawImages = (options.referenceImages || []).filter(Boolean);
        const uniqueImages = [...new Set(rawImages)];
        if (uniqueImages.length === 0) {
            throw new Error('Omni reference video requires at least 1 reference image');
        }

        const resolvedMediaIds: string[] = [];
        for (const img of uniqueImages.slice(0, 3)) { // Flow limits to 3 references
            resolvedMediaIds.push(await this.resolveMediaInput(account, img, projectId));
        }

        const duration = options.durationSeconds === 5 ? '5s' : '10s';
        const videoModelKey = `abra_r2v_${duration}`;
        const rawRatio = options.aspectRatio || 'VIDEO_ASPECT_RATIO_LANDSCAPE';
        const aspectRatio = this.mapAspectRatio(AIModelType.VIDEO, rawRatio);

        let retry = 5;
        while (retry > 0) {
            try {
                const recaptchaToken = await captchaService.solve({
                    projectId: projectId,
                    action: 'VIDEO_GENERATION',
                    tokenId: (account as any).id || (account as any)._id
                });

                if (!recaptchaToken) {
                    throw new Error('Failed to obtain reCAPTCHA token for Flow Omni generation');
                }

                const sessionId = this.getSessionId();
                const sceneId = uuidv4();
                const url = `${this.apiBaseUrl}/video:batchAsyncGenerateVideoReferenceImages`;

                const clientContext = {
                    recaptchaContext: {
                        token: recaptchaToken,
                        applicationType: "RECAPTCHA_APPLICATION_TYPE_WEB"
                    },
                    sessionId: sessionId,
                    projectId: projectId,
                    tool: 'PINHOLE',
                    userPaygateTier: options.userPaygateTier || "PAYGATE_TIER_ZERO"
                };

                const requests: any = {
                    aspectRatio: aspectRatio,
                    seed: Math.floor(Math.random() * 99999) + 1,
                    videoModelKey: videoModelKey,
                    metadata: { sceneId: sceneId },
                    textInput: {
                        structuredPrompt: {
                            parts: [{ text: prompt }]
                        }
                    },
                    referenceImages: resolvedMediaIds.map(id => ({
                        mediaId: id,
                        imageUsageType: 'IMAGE_USAGE_TYPE_ASSET'
                    }))
                };

                const payload: any = {
                    clientContext: clientContext,
                    requests: [requests],
                    useV2ModelConfig: true,
                    mediaGenerationContext: {
                        batchId: uuidv4()
                    }
                };

                const headers = this.getHeaders(account);
                Logger.info(`[FlowAdapter.generateOmniVideo] Target: ${url}, ModelKey: ${videoModelKey}, References: ${resolvedMediaIds.length}`);
                const response = await axios.post(url, payload, { headers });

                const mediaName = response.data.name ||
                                  response.data.operation?.name ||
                                  response.data.results?.[0]?.name ||
                                  response.data.media?.[0]?.name;

                if (!mediaName) {
                    throw new Error('Flow API Error: No operation name returned for Omni video');
                }

                Logger.info(`[FlowAdapter.generateOmniVideo] Generation submitted. Operation: ${mediaName}`);

                if (options.async === true) {
                    return { jobId: mediaName, status: 'pending' };
                }

                return await this.pollMedia(account, projectId, mediaName, AIModelType.VIDEO);
            } catch (error: any) {
                const msg = error.response?.data?.error?.message || error.message;
                if (error.response?.status === 404 || msg?.includes('Requested entity was not found')) {
                    const newProjectId = await this.createFlowProject(account, projectId);
                    if (!newProjectId) throw new Error('Flow Video Generation Failed: Failed to create new project');
                    projectId = newProjectId;
                    retry--;
                    continue;
                }
                if (msg.includes("Resource has been exhausted")) {
                    await flowSyncService.refreshAccountTokens(account);
                }
                if (msg !== "reCAPTCHA evaluation failed") {
                    throw new Error(`Flow Omni Video Generation Failed: ${msg}`);
                }
                Logger.info(`[FlowAdapter.generateOmniVideo] reCAPTCHA evaluation failed. Retrying in 5s...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                retry--;
            }
        }
        return null;
    }

    /**
     * Poll for media generation results
     */
    private async pollMedia(account: IAIAccount, projectId: string, mediaName: string, type: AIModelType.IMAGE | AIModelType.VIDEO): Promise<any> {
        const url = type === AIModelType.VIDEO 
            ? `${this.apiBaseUrl}/video:batchCheckAsyncVideoGenerationStatus`
            : `${this.apiBaseUrl}/projects/${projectId}/${mediaName}`;

        const headers = {
            'Authorization': `Bearer ${account.access_token}`,
            'User-Agent': account.last_fingerprint?.get('user_agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
            'Content-Type': 'application/json',
            'Origin': 'https://labs.google',
            'Referer': 'https://labs.google/fx/tools/flow',
        };

        const maxPolls = 18; // 3 minutes
        let pollCount = 0;
        let results: any = null;

        await new Promise(resolve => setTimeout(resolve, 5000));

        while (pollCount < maxPolls) {
            try {
                if (type === AIModelType.VIDEO) {
                    const payload = {
                        media: [{ name: mediaName, projectId: projectId }]
                    };
                    const response = await axios.post(url, payload, { headers });
                    Logger.info(`[FlowAdapter] [pollMedia] [${pollCount + 1}/${maxPolls}]`);
                    // Logger.info(`[FlowAdapter] [pollMedia] response: ${JSON.stringify(response.data)}`);
                    const opResult = response.data.operations?.[0]?.operation || {};
                    const mediaItem = response.data.media?.[0] || {};
                    const status = response.data.operations?.[0]?.status || mediaItem.status || mediaItem.mediaMetadata?.state || mediaItem.mediaMetadata?.mediaStatus?.mediaGenerationStatus || "";

                    if (status === 'MEDIA_GENERATION_STATUS_ACTIVE' || status === 'MEDIA_GENERATION_STATUS_PENDING' || status === 'PENDING') {
                        // continue polling
                    } else if (status === 'MEDIA_GENERATION_STATUS_FAILED') {
                        throw new Error(opResult.error?.message || mediaItem.error?.message || 'Video generation failed');
                    } else if (status === 'MEDIA_GENERATION_STATUS_SUCCESSFUL' || status === 'SUCCEEDED' || status === 'MEDIA_GENERATION_STATUS_COMPLETE') {
                        // 1. First priority: Get real video download redirect URL via trpc media.getMediaUrlRedirect
                        let videoUri = await this.getMediaUrlRedirect(account, mediaName);

                        // 2. Fallback: Extract video from status response / opResult / mediaItem via EntityNormalizer
                        if (!videoUri) {
                            const extractedFromStatus = EntityNormalizer.extractVideoFromResponse(response.data);
                            if (extractedFromStatus?.url && !extractedFromStatus.url.startsWith('data:')) {
                                videoUri = extractedFromStatus.url;
                            } else if (extractedFromStatus?.buffer) {
                                results = { buffer: extractedFromStatus.buffer, mimeType: extractedFromStatus.mimeType || 'video/mp4' };
                                break;
                            }
                        }

                        // 3. Fallback: query /media/{name}
                        if (!videoUri && !results) {
                            try {
                                const mediaRes = await axios.get(`${this.apiBaseUrl}/media/${mediaName}`, { headers });
                                const extractedFromMedia = EntityNormalizer.extractVideoFromResponse(mediaRes.data);
                                if (extractedFromMedia) {
                                    if (extractedFromMedia.buffer) {
                                        results = { buffer: extractedFromMedia.buffer, mimeType: extractedFromMedia.mimeType || 'video/mp4' };
                                        break;
                                    }
                                    if (extractedFromMedia.url) {
                                        videoUri = extractedFromMedia.url;
                                    }
                                }
                            } catch (mErr) {
                                Logger.warn(`[FlowAdapter] Failed to fetch media detail for ${mediaName}: ${mErr}`);
                            }
                        }

                        if (videoUri) {
                            Logger.info(`[FlowAdapter] Video completed: ${mediaName} -> ${videoUri.slice(0, 80)}...`);
                            results = { url: videoUri, mimeType: 'video/mp4' };
                        }
                        break;
                    }
                } else {
                    const response = await axios.get(url, { headers });
                    const data = response.data;

                    if (data.done || data.state === 'SUCCEEDED') {
                        const extracted = EntityNormalizer.extractImageFromResponse(data);
                        if (extracted) {
                            results = {
                                buffer: extracted.buffer || (extracted.url.startsWith('data:') ? Buffer.from(extracted.url.split(',')[1], 'base64') : undefined),
                                url: extracted.url,
                                mimeType: extracted.mimeType,
                            };
                        }
                        break;
                    }
                    if (data.error || (data.state === 'FAILED')) throw new Error(data.error?.message || 'Generation failed');
                }
            } catch (err: any) {
                const errBody = err.response?.data ? JSON.stringify(err.response.data) : err.message;
                Logger.warn(`[FlowAdapter] Polling attempt ${pollCount + 1} notice: ${errBody}`);
                if (err.message?.includes('Video generation failed')) {
                    throw err;
                }
            }

            pollCount++;
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
        if(results){
            return results;
        }
        throw new Error(`${type} generation failed.`);
    }

    /**
     * Resolve actual video access URL via Google Labs trpc getMediaUrlRedirect
     */
    public async getMediaUrlRedirect(account: IAIAccount, mediaName: string): Promise<string | null> {
        const st = account.session_token || '';
        const normalizedMediaName = (mediaName || '').trim();
        if (!normalizedMediaName) return null;

        const url = `https://labs.google/fx/api/trpc/media.getMediaUrlRedirect?name=${encodeURIComponent(normalizedMediaName)}&mediaUrlType=MEDIA_URL_TYPE_FULL_MEDIA`;
        const userAgent = account.last_fingerprint?.get('user_agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';

        const headers: any = {
            'Cookie': `__Secure-next-auth.session-token=${st}`,
            'User-Agent': userAgent,
            'Referer': 'https://labs.google/fx/tools/flow',
            'Origin': 'https://labs.google',
            'Accept': '*/*',
        };

        if (account.last_fingerprint) {
            const fp = account.last_fingerprint;
            if (fp.get('sec_ch_ua')) headers['sec-ch-ua'] = fp.get('sec_ch_ua');
            if (fp.get('sec_ch_ua_mobile')) headers['sec-ch-ua-mobile'] = fp.get('sec_ch_ua_mobile');
            if (fp.get('sec_ch_ua_platform')) headers['sec-ch-ua-platform'] = fp.get('sec_ch_ua_platform');
            if (fp.get('accept_language')) headers['Accept-Language'] = fp.get('accept_language');
        }

        try {
            const response = await axios.get(url, {
                headers,
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 400
            });

            if (response.status >= 300 && response.status < 400) {
                const location = response.headers['location'] || response.headers['Location'];
                if (location) {
                    Logger.info(`[FlowAdapter] Resolved video redirect URL for ${mediaName}: ${location.slice(0, 100)}...`);
                    return location;
                }
            }

            if (response.data?.result?.data?.json?.url) {
                return response.data.result.data.json.url;
            }

            if (response.status === 200 && response.data && typeof response.data === 'string' && response.data.startsWith('http')) {
                return response.data;
            }
        } catch (err: any) {
            if (err.response?.headers?.location || err.response?.headers?.Location) {
                const loc = err.response.headers.location || err.response.headers.Location;
                Logger.info(`[FlowAdapter] Resolved video redirect (from catch) for ${mediaName}: ${loc.slice(0, 100)}...`);
                return loc;
            }
            Logger.warn(`[FlowAdapter] getMediaUrlRedirect failed for ${mediaName}: ${err.message}`);
        }

        return null;
    }

    /**
     * Generate Text / JSON content using Google Flow generateContent API (gemini-3-flash-preview)
     */
    public async generateContent(
        account: IAIAccount,
        prompt: string,
        options: {
            model?: string;
            systemInstruction?: string;
            jsonMode?: boolean;
            thinkingLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
        } = {}
    ): Promise<string | null> {
        await this.syncFlowAccount(account);
        let projectId = account.project_id;
        if (!projectId) {
            projectId = await flowSyncService.ensureProject(account);
            account.project_id = projectId;
        }
        const url = `${this.apiBaseUrl}/flow:generateContent`;
        const targetModel = options.model || 'gemini-3-flash-preview';

        const appletUrl = `https://labs.google/fx/tools/flow/project/${projectId}/tool/f640e294-1f05-4fce-97a0-95ccfea29b9d`;

        let retry = 3;
        while (retry > 0) {
            try {
                const recaptchaToken = await captchaService.solve({
                    projectId: projectId,
                    websiteURL: appletUrl,
                    action: '',
                    tokenId: (account as any).id || (account as any)._id
                });

                if (!recaptchaToken) {
                    throw new Error('Flow Text Generation Failed: ReCaptcha token missing');
                }

                let systemInstructionPayload: any = undefined;
                if (options.systemInstruction) {
                    systemInstructionPayload = {
                        parts: [{ text: options.systemInstruction }]
                    };
                }

                const payload: any = {
                    model: targetModel,
                    contents: [
                        {
                            role: 'user',
                            parts: [{ text: prompt }]
                        }
                    ],
                    systemInstruction: systemInstructionPayload,
                    thinkingConfig: {
                        thinkingLevel: options.thinkingLevel || 'LOW'
                    },
                    requestContext: {
                        flowSdkInfo: {
                            appletId: 'f640e294-1f05-4fce-97a0-95ccfea29b9d',
                            appletVersionId: '4e59059a-055d-4f99-8467-4d882522ef90'
                        }
                    },
                    recaptchaContext: {
                        token: recaptchaToken,
                        applicationType: 'RECAPTCHA_APPLICATION_TYPE_WEB'
                    }
                };

                const headers = this.getHeaders(account, appletUrl);
                Logger.info(`[FlowAdapter] [generateContent] targetURL: ${url}, model: ${targetModel}`);

                const response = await axios.post(url, payload, { headers });

                const candidates = response.data?.candidates;
                if (Array.isArray(candidates) && candidates.length > 0) {
                    const parts = candidates[0]?.content?.parts || [];
                    const text = parts.map((p: any) => p.text || '').join('');
                    if (text) {
                        return text;
                    }
                }

                Logger.error(`[FlowAdapter] No text returned from Flow generateContent: ${JSON.stringify(response.data).substring(0, 300)}...`);
                throw new Error('Flow API Error: No text returned from generateContent');
            } catch (error: any) {
                const msg = error.response?.data?.error?.message || error.message;
                if (msg !== 'reCAPTCHA evaluation failed') {
                    throw new Error(`Flow generateContent Failed: ${msg}`);
                }
                Logger.info(`[FlowAdapter] reCAPTCHA evaluation failed. Retrying in 5s...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                retry--;
            }
        }
        return null;
    }
}

export const flowAdapter = new FlowAdapter();
