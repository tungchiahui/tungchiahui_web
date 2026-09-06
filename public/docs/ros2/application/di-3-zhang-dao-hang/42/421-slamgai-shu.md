SLAM（Simultaneous Localization and Mapping，即时定位与建图）是机器人学和自动导航领域的一种关键技术，允许机器人在未知环境中导航的同时创建环境地图。

在ROS 2环境下进行SLAM，通常涉及使用专门为ROS 2开发的SLAM相关软件包。这些软件包利用ROS 2的通讯框架（如话题、服务和action）来处理和分配受到传感器数据，包括激光雷达、相机、惯性测量单元等。

以下列举了一些常见的在ROS2中使用的SLAM系统：

1. **SLAM Toolbox**：SLAM Toolbox 是一种在 ROS 2 中普遍使用的 SLAM 解决方案，由 Steve Macenski 维护。它是为了替代原有的ROS中著名的gmapping包和Cartographer SLAM包而开发的，提供了2D激光SLAM领域中的多种功能。

2. **Cartographer for ROS 2**：Cartographer是由Google开发的一个2D和3D环境SLAM库。尽管它最初是为ROS开发的，但已经有为ROS 2创建的适配版本，可以在ROS 2生态系统内使用。

要在ROS 2中开始一个SLAM项目，还需要具体的传感器（例如激光雷达或摄像头），计算机要有足够的算力来运行SLAM算法，以及熟悉ROS 2节点、话题、服务、action、参数等知识，以实现有效的数据处理和通信。随着项目的发展，可能还需要考虑动态重配置、3D建图和路径规划等高级功能。

