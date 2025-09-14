FROM buildpack-deps:bookworm

ENV SHELL=bash
ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y \
          apt-transport-https \
          ca-certificates \
          curl \
          git \
          gosu \
          groff \
          jq \
          keychain \
          make \
          python3 \
          python3-pip \
          sudo \
          unzip \
          vim \
          wget

ENV LC_ALL=en_US.UTF-8
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US.UTF-8

ENTRYPOINT ["/bin/bash"]
