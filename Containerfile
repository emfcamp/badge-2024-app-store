FROM node

ARG PROJECT
WORKDIR /opt/${PROJECT}

RUN apt-get update && apt-get install -y nginx vim

# YOLO
RUN curl -fsSL https://bun.com/install | bash

COPY ./ /opt/${PROJECT}

COPY docker-config/bashrc /root/.bashrc
COPY ./docker-config/entrypoint.sh /usr/local/bin/entrypoint
RUN chmod +x /usr/local/bin/entrypoint
ENTRYPOINT ["/usr/local/bin/entrypoint"]
