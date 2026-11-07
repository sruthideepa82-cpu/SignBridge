import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildCameraStreamUrl,
  getCameraStatus,
  startCamera as requestStartCamera,
  stopCamera as requestStopCamera,
} from '../services/cameraService.js';

export const CAMERA_STATUS = {
  IDLE: 'idle',
  STARTING: 'starting',
  LIVE: 'live',
  ERROR: 'error',
};

const HEALTH_POLL_INTERVAL_MS = 2000;

export default function useCamera() {
  const [status, setStatus] = useState(CAMERA_STATUS.IDLE);
  const [errorMessage, setErrorMessage] = useState('');
  const [streamUrl, setStreamUrl] = useState(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      requestStopCamera().catch(() => {});
    };
  }, []);

  const failWith = useCallback((message) => {
    setStreamUrl(null);
    setErrorMessage(message);
    setStatus(CAMERA_STATUS.ERROR);
  }, []);

  const startCamera = useCallback(async () => {
    setErrorMessage('');
    setStatus(CAMERA_STATUS.STARTING);
    try {
      const cameraStatus = await requestStartCamera();
      if (!isMounted.current) return;
      if (!cameraStatus.running) {
        failWith(cameraStatus.last_error ?? 'The camera did not start.');
        return;
      }
      setStreamUrl(buildCameraStreamUrl());
      setStatus(CAMERA_STATUS.LIVE);
    } catch (error) {
      if (isMounted.current) failWith(error.message);
    }
  }, [failWith]);

  const stopCamera = useCallback(async () => {
    setStreamUrl(null);
    setErrorMessage('');
    setStatus(CAMERA_STATUS.IDLE);
    try {
      await requestStopCamera();
    } catch (error) {
      if (isMounted.current) failWith(error.message);
    }
  }, [failWith]);

  const handleStreamError = useCallback(() => {
    failWith('The live video stream was interrupted. Check the camera connection, then try again.');
    requestStopCamera().catch(() => {});
  }, [failWith]);

  useEffect(() => {
    if (status !== CAMERA_STATUS.LIVE) return undefined;

    const intervalId = setInterval(async () => {
      try {
        const cameraStatus = await getCameraStatus();
        if (!cameraStatus.running) {
          failWith(cameraStatus.last_error ?? 'The camera stopped unexpectedly.');
        }
      } catch (error) {
        failWith(error.message);
      }
    }, HEALTH_POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [status, failWith]);

  return {
    status,
    errorMessage,
    streamUrl,
    startCamera,
    stopCamera,
    handleStreamError,
  };
}
