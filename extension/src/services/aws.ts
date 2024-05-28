import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { APSManifest, Derivative, DownloadObject } from "../types";

const lambdaClient = new LambdaClient({
  region: import.meta.env.VITE_AWS_REGION,
  credentials: {
    accessKeyId: import.meta.env.VITE_AWS_ACCESS_KEY_ID,
    secretAccessKey: import.meta.env.VITE_AWS_SECRET_ACCESS_KEY,
  },
});

export async function getDownloadUrlFromLambda(downloadObject: DownloadObject) {
  const payload = JSON.stringify(downloadObject);

  const params = {
    FunctionName: "shl-bim360-MergeDerivativesFunction-dDWAP47Isfnf",
    Payload: payload as any,
  };

  const command = new InvokeCommand(params);

  try {
    const start = performance.now();
    const response = await lambdaClient.send(command);
    const end = performance.now();
    console.log(`Execution time: ${end - start} ms`);

    const result = JSON.parse(new TextDecoder().decode(response.Payload));
    console.log("Lambda response:", result);

    return JSON.parse(result.body).url;
  } catch (error) {
    console.error("Error invoking Lambda:", error);
  }
}

export async function formatDownloadObjects(
  urn: string,
  token: string,
  manifest: APSManifest
) {
  const derivative = manifest.derivatives[0];
  const pdfViews = derivative.children.filter(
    (v) => v.role == "2d" && !!v.properties?.["Print Setting"]
  );

  const pdfDerivatives = pdfViews.map((v) =>
    v.children.find((d) => d.role == "pdf-page")
  );

  const revitVersion =
    derivative.properties["Document Information"]?.RVTVersion;

  if (parseInt(revitVersion) < 2022) return;

  const downloadObject = {
    urn: urn.replace("-", "_"),
    derivatives: pdfDerivatives.map((d) => d?.urn) as string[],
    token,
  };

  return downloadObject;
}

export async function exportDerivatives(
  derivatives: Derivative[],
  urn: string,
  token: string
) {
  try {
    if (derivatives == null || urn == null || token == null) return;

    const derivativesToExport: Derivative[] = [];

    derivatives.forEach((d) => {
      if (d.active) derivativesToExport.push(d);
      d.children.forEach(() => {
        if (d.active) derivativesToExport.push(d);
      });
    });

    const downloadObject: DownloadObject = {
      urn: urn,
      token: token,
      derivatives: derivativesToExport.map((d) => d.urn),
    };

    console.log("exportDerivatives", downloadObject);
    const url = await getDownloadUrlFromLambda(downloadObject);

    if (!url) return;

    return {
      url,
      conflictAction: "uniquify",
    };
  } catch (error) {
    console.log(error);
  }
}
