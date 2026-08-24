### 2.3.1 相机远程图传

如果相机连接在本地，图像一般是可以正常显示的，但是如果远程访问，可能会因为网络带宽限制，图像会出现延迟、卡顿、掉帧等现象，那么如何优化呢？

在ROS2中默认安装了名为`image_transport_plugins`的功能包，可以自动对图片做压缩处理，以提高图像传输效率。

#### 1.启动远程端相机驱动

请先启动远程端的相机驱动（请按照**1.6.1 单目相机使用**编写相机驱动），成功后使用`ros2 topic list`指令可以查看到名为`/camera1/image_compressed`的话题，该话题是由`image_transport_plugins`功能包发布的压缩后的图片数据。

#### 2.本地订阅订阅压缩数据并解压缩

本地可以订阅但不能直接使用压缩后的数据，我们需要通过特定节点解压然后后再发布，该节点执行示例如下：

```
ros2 run image_transport republish compressed --ros-args --remap in/compressed:=camera1/image_compressed --remap out:=image_raw/uncompressed
```

#### 3.查看图像数据

重新启动`rviz2`，添加`image`插件，并将话题设置为：`image_raw/uncompressed`，图像显示效果，会有很大改善。

