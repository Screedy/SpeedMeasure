# Debian rather than Alpine: the Ookla CLI ships glibc binaries only.
FROM node:24-bookworm-slim

# Provided automatically by buildx / compose; drives the x86_64 vs aarch64 downloads.
ARG TARGETARCH
ARG OOKLA_VERSION=1.2.0
ARG LIBRESPEED_VERSION=1.0.11

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl iperf3 \
	&& rm -rf /var/lib/apt/lists/* \
	&& case "$TARGETARCH" in \
		amd64) OOKLA_ARCH=x86_64; LS_ARCH=amd64 ;; \
		arm64) OOKLA_ARCH=aarch64; LS_ARCH=arm64 ;; \
		*) echo "unsupported TARGETARCH: $TARGETARCH" >&2; exit 1 ;; \
	esac \
	&& curl -fsSL "https://install.speedtest.net/app/cli/ookla-speedtest-${OOKLA_VERSION}-linux-${OOKLA_ARCH}.tgz" \
		| tar -xz -C /usr/local/bin speedtest \
	&& curl -fsSL "https://github.com/librespeed/speedtest-cli/releases/download/v${LIBRESPEED_VERSION}/librespeed-cli_${LIBRESPEED_VERSION}_linux_${LS_ARCH}.tar.gz" \
		| tar -xz -C /usr/local/bin librespeed-cli \
	&& speedtest --version --accept-license --accept-gdpr >/dev/null \
	&& librespeed-cli --version >/dev/null \
	&& apt-get purge -y curl && apt-get autoremove -y

WORKDIR /srv
COPY runner/package*.json ./
RUN npm ci --omit=dev
# The bundled npm CLI (and its own node_modules — tar, undici, etc.) is never invoked
# at runtime; CMD is a plain `node run.mjs`. Strip it rather than chase CVEs in code
# that never executes here.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
COPY runner/ ./
COPY shared/ ./shared/

USER node
CMD ["node", "run.mjs"]
